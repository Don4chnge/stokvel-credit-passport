# Product analytics plan (PostHog)

Analytics is optional. With no `NEXT_PUBLIC_POSTHOG_KEY` every call is a no-op and the product works as
normal. With a key, nothing loads until the visitor allows it.

## Privacy rules (enforced in `src/lib/analytics.ts` and tested)

- Autocapture and session recording are off.
- Only allow-listed properties are sent: `channel`, `frequency`, `scope_count`, `expires_in_days`,
  `account_type`, `outcome`, `method`.
- The distinct id is a SHA-256 hash of the internal user id.
- Never sent: names, emails, bank details, references, transaction descriptions, identity numbers,
  amounts tied to a person.

## Events

| Event | Fired when | Properties |
| --- | --- | --- |
| user_signed_up | Registration succeeds | account_type |
| member_joined_stokvel | A join request is sent | |
| stokvel_created | A group is created | frequency |
| contribution_initiated | A member starts or records a contribution | channel |
| contribution_verified | Provider confirms or treasurer verifies | method |
| passport_generated | A Passport is generated | |
| passport_downloaded | The PDF is downloaded | |
| passport_shared | A sharing link is created | scope_count, expires_in_days |
| passport_accessed | A lender opens a shared Passport | scope_count |
| passport_revoked | A member revokes a link | |
| lender_verification_completed | A lender view loads | outcome |

## Funnels to build in PostHog

1. Landing page view → `user_signed_up`
2. `user_signed_up` → `member_joined_stokvel` or `stokvel_created`
3. Membership → `contribution_initiated` → `contribution_verified`
4. `contribution_verified` → `passport_generated`
5. `passport_generated` → `passport_shared` → `passport_accessed`

Questions these answer: where members drop off before a first verified contribution, how long
verification takes by channel, what share of Passports are ever shared, and which scopes members choose.
