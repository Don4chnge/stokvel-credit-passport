# Launch checklist: 20 points

Status of each point in this prototype. "Tested" names the automated test that proves it.
The policies are drafts. An attorney has not reviewed them. Passing this list is not legal compliance.

| # | Point | Status | Where | Tested | Still needed from you |
| --- | --- | --- | --- | --- | --- |
| 1 | Privacy policy | Draft published | `/privacy` | e2e 05, test 1 | Attorney review. Appoint an Information Officer |
| 2 | Terms of service | Draft published. Version recorded at sign-up | `/terms` | e2e 05, test 2 | Attorney review |
| 3 | Refund policy | Published. No fees, so no platform refunds. Explains contributions | `/refunds` | e2e 05, test 3 | Update if fees are ever charged |
| 4 | Cookie policy | Published. Lists every cookie and storage key | `/cookies` | e2e 05, test 4 | Add hosting provider cookies after deployment, if any |
| 5 | Cookie consent banner | Built. Asks on first visit. Nothing optional set before a choice | `CookieConsent.tsx` | e2e 05, test 5 | None |
| 6 | Form consents | Registration: terms and privacy, unticked. Pilot form: contact consent, unticked. Sharing: no field pre-selected. Consent time and terms version stored | Register, pilot and sharing forms | e2e 05 tests 6, backend `test_registration_needs_terms_and_age_confirmation` | None |
| 7 | No unnecessary data | Unused phone column removed. No identity number, address, date of birth, bank details or uploads | Migration 0002 | backend `test_no_unneeded_personal_fields_are_stored`, e2e 05 test 7 | None |
| 8 | Third-party SDK audit | One optional SDK (PostHog), off without a key and without consent. Fonts self-hosted. A first visit calls no other domain | `/legal#third-parties` | e2e 05, test 8 | Re-audit after adding a payment provider or host |
| 9 | Dark patterns | Cookie choices equal in size and style. No pre-ticked boxes. Revoke and delete are one or two clicks. No countdowns, no forced sign-up | Across the site | e2e 05 tests 5, 6, 9 | None |
| 10 | Hidden fees | None. Price stated in the FAQ, on the sign-up page, in the terms and the refund policy | FAQ, `/terms#fees` | e2e 05, test 10 | State prices here before charging anything |
| 11 | Fake reviews | None existed. None added | `/legal#claims` | e2e 05, test 11 | Add only real, attributable reviews, with permission |
| 12 | Unsupported claims | Public copy carries no statistics, partners or results. Sample data is labelled illustrative. Index described as experimental | Public site | e2e 05, test 11 | Keep sources for any figure you add (see RESEARCH.md) |
| 13 | Alt text | Text alternatives on the contribution ring, charts and QR code. Decorative art hidden from screen readers, with a spoken caption | Components | e2e 05, axe scans and test 13 | None |
| 14 | Colour contrast | Passes automated WCAG 2.1 AA contrast checks on 21 screens | Design system | e2e 05, axe scans | Manual check with a screen reader before launch |
| 15 | Keyboard navigation | Skip link, visible focus, dialogs trap focus, close on Escape and return focus. Inline links underlined | `ui.tsx` Modal | e2e 05, two keyboard tests | Manual pass with a keyboard-only user |
| 16 | Business details | Shown in the footer and on every legal page. Unknown fields say so | `src/lib/business.ts` | e2e 05, test 16 | Your registered company name, registration number, address and contact email |
| 17 | Age consent | 18+ confirmation required at sign-up, enforced by the API. Policy covers children | Register form, `/privacy#children` | e2e 05 test 6 and 17, backend test | Legal view on age verification beyond self-declaration |
| 18 | Unsubscribe link | The app sends no emails. One-step unsubscribe endpoint and page are ready for pilot contacts | `/unsubscribe/[token]` | e2e 05, test 18, backend `test_pilot_contact_unsubscribes_in_one_step` | Put the link in every email once you send any |
| 19 | Font and image licences | Fonts under SIL OFL 1.1. All artwork original. No stock photos | `/legal#licences` | e2e 05, test 19 | Keep licences for any photo you add |
| 20 | Data deletion request | Request, status and cancel in the account page. Admin list of requests. 30-day promise | `/member/account` | e2e 05 test 9 and 20, backend `test_deletion_request_lifecycle` | A process to carry out deletions. Automated erasure is not built |

## What an automated check does not cover

- axe finds roughly a third to half of accessibility problems. A manual test with a screen reader and a
  keyboard-only user is still needed.
- The policy text is a starting draft, written to match how the product works. South African law
  (POPIA, the Consumer Protection Act, ECTA and the National Credit Act) needs an attorney.
- Business details are placeholders until you register the business.
