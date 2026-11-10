# Demo script

Seed first: `cd backend && python -m app.seed --reset`. Password for every demo account:
`Passport-Demo-2026`. Everything shown is synthetic.

| Step | Action | What to point out |
| --- | --- | --- |
| 1 | Open http://localhost:3000 | Positioning, the animated Passport, the problem section |
| 2 | Sign in as member@demo.stokvelpassport.example | One sign-in for every role |
| 3 | Member overview | The contribution ring: one seat per period, one missed seat, the plain explanation |
| 4 | Contributions | Status, proof level, reference and ledger hash on every record. Try "Request PayShap payment" and simulate an approved payment (TEST MODE) |
| 5 | Credit Passport, "Generate my Passport" | Snapshot of the ledger state at issue |
| 6 | Read the Passport | Six factors with weights, the disclaimer, QR code, PDF download |
| 7 | Consent centre, create a sharing link | Choose fields, expiry, recipient. Copy the link. It is shown once |
| 8 | Sign out. Sign in as lender@demo.stokvelpassport.example | Separate lender portal |
| 9 | Paste the link, "Open Passport" | Verified banner, only the shared fields, provenance, report download |
| 10 | Sign in as the member, Consent centre, "Revoke access" | The access log names the lender. Open the link again as the lender: access refused |
| 11 | Sign in as treasurer@demo.stokvelpassport.example, "Stokvel management" | Group overview |
| 12 | Contributions, "Verify payment" | Self-reported stays pending until checked. The calendar reconciles each period |
| 13 | Ledger | Append-only events with previous and current hashes |
| 14 | "Run integrity verification" | Every hash recomputed from genesis |
| 15 | "Simulate a tampered record" | One changed amount fails the chain. An edit plus a recomputed hash still fails at the next link |
| 16 | Sign in as platform@demo.stokvelpassport.example, Fairness report, "Run fairness report" | Group comparisons, sample-size flags, stated limits |

Optional: sign in as admin@demo.stokvelpassport.example to approve the waiting join request. The
administrator manages members but cannot verify payments.
