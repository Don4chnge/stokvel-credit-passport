# Security and POPIA design notes

Designed with POPIA in mind. **Not legally reviewed. No compliance is claimed.**

| Control | Implementation |
| --- | --- |
| Passwords | bcrypt, 12 rounds. Minimum 10 characters with letters and numbers |
| Sessions | Signed JWT in an httpOnly, SameSite=Lax cookie (Secure in production). 8 hour lifetime |
| Role checks | The role is read from the database on every request. A role claim inside a token is ignored |
| Authorisation | Every endpoint checks the caller. Stokvel actions check membership, status and role permission |
| Tenant isolation | Members see their own records. Managers see their own stokvel. Lenders see nothing without a token |
| Sharing tokens | 256-bit random token shown once. Only its SHA-256 hash is stored. Expiry and revocation checked on every use |
| Data minimisation | A shared view contains only the scopes the member chose. No internal ids, no email |
| Public verification | The QR check returns initials and Passport id only. No financial detail |
| Input validation | Pydantic models on every body. Reference fields are pattern-restricted |
| Rate limiting | In-memory sliding window. 20 per minute on sign-in and registration, 240 per minute elsewhere |
| Audit log | Sign-ins, failed sign-ins, verifications, reversals, sharing, access, role changes, exports, admin actions |
| Errors | Unhandled errors return a generic message. No stack traces |
| Headers | nosniff, frame deny, referrer policy, no-store on API responses |
| Secrets | Environment variables only. `.env` is git-ignored. `.env.example` holds no values |
| Analytics | Off by default. Allow-listed properties only. Hashed distinct id. No names, amounts or references |
| File uploads | None. The product accepts no documents, so no bank statements or identity documents are stored |

Member rights supported: download own data, report an incorrect record, request deletion, revoke sharing,
withdraw analytics consent.

The 20-point security audit and its tests are in [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).

Known gaps before a pilot:

- Rate limiting is per process. Use a shared store with more than one instance.
- No multi-factor authentication, email verification or password reset yet.
- No independent penetration test.
- Ledger checkpoints are stored in the same database. Publish them externally (see ARCHITECTURE.md).
- The deletion request is recorded for manual handling. Automated erasure is not built.
