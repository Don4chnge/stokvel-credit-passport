# Architecture

## Overview

```
Browser
  |  same-origin requests, httpOnly session cookie
  v
Next.js (React, TypeScript, Tailwind)        frontend/
  |  /api/*  rewritten to the API
  v
FastAPI (Pydantic, SQLAlchemy)               backend/app/
  |- routers/      thin HTTP layer, permission checks on every endpoint
  |- services.py   business rules: contributions, consent, passports
  |- ledger.py     hash chain: append, verify, checkpoint, tampering simulation
  |- scoring.py    Contribution Reliability Index. Pure functions, no database
  |- fairness.py   the only reader of protected attributes
  |- payments/     provider interface + TEST MODE provider
  |- pdf.py        Passport PDF
  v
PostgreSQL (Neon) or SQLite for local work
```

Business logic lives in `services.py`, `ledger.py` and `scoring.py`. Routers and React components hold no
scoring or ledger rules.

## Contribution lifecycle

```
member initiates ──> pending (self_reported)
   |- PayShap Request ──> provider webhook: succeeded ──> verified (provider_confirmed) ──> ledger event
   |                                   └── failed    ──> rejected, nothing on the ledger
   └─ recorded by hand ──> treasurer verifies ──> verified (manually_verified) ──> ledger event
                                    └── rejects ──> rejected
verified ──> reversal ──> reversed + a new CONTRIBUTION_REVERSED ledger event (original untouched)
member reports a problem ──> under_review (a verified record keeps its status and its ledger event)
```

Rules enforced in code and covered by tests:

- A contribution is never verified because a member submitted it.
- A treasurer cannot verify their own contribution.
- `Idempotency-Key` is required. The same key returns the same record. A second record for the same
  member and period is refused with 409.
- A provider webhook is applied once. `provider_event_id` is unique.

## The ledger

`current_hash = SHA256(previous_hash + canonical_event_data)`

- The first event links to a fixed genesis hash: `SHA256("STOKVEL-CREDIT-PASSPORT/GENESIS/v1")`.
- Canonical data is JSON with a fixed field set, sorted keys and no whitespace. Amounts are strings with
  two decimals. Timestamps are UTC ISO-8601 strings.
- `append_event` is the only write path. Application code never updates or deletes a ledger row.
- Verification walks the chain from genesis and reports: `HASH_MISMATCH` (content edited),
  `BROKEN_LINK` (edit plus recomputed hash), `SEQUENCE_GAP` (event removed or reordered),
  `CHECKPOINT_MISMATCH` (history no longer matches a recorded head hash).
- The tampering simulation copies the chain into memory and edits the copy. The stored ledger is not
  touched.

### Trust assumptions

A hash chain proves that history was not edited after the fact by anyone who cannot rewrite the whole
chain. It does **not** stop a privileged database administrator who alters an event and recomputes every
later hash. The test `test_full_rewrite_is_caught_only_by_checkpoint` documents this.

Mitigation built in: `ledger_checkpoints` stores head hashes, and verification compares the chain with
them. Mitigation still needed before a pilot: publish each checkpoint outside the database, to a party the
operator does not control. Options: email the daily head hash to each stokvel treasurer, publish to a
public transparency log, or anchor with a trusted timestamping service (RFC 3161). Also restrict database
roles so the application user has INSERT and SELECT only on `ledger_events`.

## Database

UUIDs are used for every externally exposed id. Money is `NUMERIC(14,2)`, never floating point.
Timestamps are stored in UTC.

| Table | Purpose | Key relationships |
| --- | --- | --- |
| users | Accounts. Platform role: member, lender, platform_admin | |
| member_profiles | Passport id, analytics consent | 1:1 users |
| member_demographics | Age band, gender. Fairness audit only | 1:1 users |
| lender_accounts | Lender organisation | 1:1 users |
| stokvels | Group, amount, frequency, join code | created_by users |
| stokvel_roles | owner, treasurer, administrator, member and their permissions | |
| stokvel_memberships | Member in a group, role, status, joined and left dates | stokvels, users, stokvel_roles. Unique (stokvel, user) |
| contribution_schedules | One row per contribution period | stokvels. Unique (stokvel, due_date) |
| contributions | A member's payment for a period, status and proof level | stokvels, users, schedules. Unique (member, idempotency_key) |
| payment_requests | Provider request for a contribution | 1:1 contributions. Unique provider_reference |
| payment_provider_events | Webhooks received | payment_requests. Unique provider_event_id |
| ledger_events | Append-only hash chain | Refers to member, stokvel, contribution by id |
| ledger_checkpoints | Recorded head hashes | |
| score_models | Versioned model config and weights | |
| member_score_snapshots | Each calculated index with factors and an inputs digest | users |
| passport_reports | Issued Passport snapshot and verification code | users, snapshots |
| passport_consents | Sharing link: scopes, token hash, expiry, revocation | users, passport_reports |
| passport_access_logs | Every access attempt and its outcome | consents, lender_accounts |
| audit_logs | Sensitive actions | users |
| fairness_audit_records | Stored fairness report runs | users |
| pilot_interest | Pilot registrations from the public site | |

Indexes cover every foreign key used in lookups, status filters and the unique constraints above. The
schema is created by `migrations/versions/0001_initial_schema.py`.

## Frontend structure

```
src/app/            page.tsx (public site), signin, register, legal, verify/[code]
src/app/member/     overview, contributions, passport, sharing, account
src/app/stokvel/    overview, contributions, members, ledger
src/app/lender/     verify, view/[token], history
src/app/admin/      ledger integrity, fairness, audit
src/components/     ContributionRing, PassportCard, LedgerDemo, LedgerTools, Shell, ui
src/lib/            api client, auth context, analytics, formatting, selected group
```

The design system is in `tailwind.config.ts` and `globals.css`: deep forest `#101B19`, dark green
`#1C2B26`, warm ivory `#F4F1E8`, electric lime `#C6E66B`, muted copper `#B78A62`, secondary text
`#A8B8AE`. Fraunces for headlines, Instrument Sans for interface text, IBM Plex Mono for hashes and ids.
The recurring motif is the contribution ring: one seat per contribution period, like the circle a stokvel
sits in.
