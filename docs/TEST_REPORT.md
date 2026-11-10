# Test report

Last full run: 10 November 2026, in the build environment (Linux, Python 3.13, Node.js 22, Chromium via
Playwright 1.63, PostgreSQL 16).

| Suite | Command | Result |
| --- | --- | --- |
| Backend on SQLite | `cd backend && pytest -q` | 169 passed |
| Backend on PostgreSQL 16 | `TEST_DATABASE_URL=postgresql://... pytest -q` | 169 passed |
| Migrations | `alembic upgrade head` on PostgreSQL, downgrade to 0001 and upgrade again | Applied both ways |
| Frontend types | `npm run lint` | No errors |
| Frontend unit tests | `npm test` | 21 passed |
| Frontend production build | `npm run build` | 25 routes built |
| End to end, desktop | `npm run e2e` | 70 passed |
| Ledger database rule | UPDATE, DELETE and TRUNCATE on `ledger_events` after migration 0003, PostgreSQL 16 | All three rejected |
| Dependency advisories | `npm audit`, `pip-audit -r requirements.txt` | No known vulnerabilities |
| Security checklist, 20 points | `backend/tests/test_hardening.py`, `e2e/06-security.spec.ts`, see SECURITY_CHECKLIST.md | Included in the counts above |
| End to end, mobile (Pixel 7) | `npm run e2e` | 3 passed |

GitHub Actions runs the same commands on every push, plus a secret scan of the full git history and
dependency advisory checks. See `.github/workflows/ci.yml`.

## Coverage map

| Requirement | Where it is tested |
| --- | --- |
| Authentication, password hashing, forged tokens, rate limiting | backend/tests/test_auth.py, e2e/02-auth.spec.ts |
| Role-based access, cross-member and cross-stokvel leakage | backend/tests/test_security.py |
| Contribution creation, verification, idempotency, duplicates | backend/tests/test_contributions.py |
| Payments: pending, success, failure, reversal, duplicate and unsigned webhooks | backend/tests/test_contributions.py, e2e/03 |
| Ledger hashing, links, altered, missing and reordered events, checkpoints, database tampering | backend/tests/test_ledger.py |
| Reversal as a new event, verified records never edited | backend/tests/test_contributions.py |
| Index calculation, bounds, reproducibility, explanations | backend/tests/test_scoring.py |
| Consent creation, scopes, expiry, revocation, access logging, lender limits | backend/tests/test_consent.py, e2e/03 |
| Fairness: independence from age and gender, excluded attributes, small-sample flags | backend/tests/test_scoring.py, test_fairness_and_seed.py |
| Synthetic data: size, consistency, behaviour mix, demo accounts | backend/tests/test_fairness_and_seed.py |
| Navigation, forms, empty states, error states | e2e/01-public.spec.ts, e2e/02-auth.spec.ts |
| Member, treasurer, administrator, lender and platform journeys | e2e/03, e2e/04 |
| Mobile layout, no sideways scrolling | e2e/responsive.spec.ts |
| Analytics privacy rules | frontend/src/__tests__/analytics.test.ts |
| The 20-point launch checklist, WCAG 2.1 AA scans, keyboard use | e2e/05-compliance.spec.ts, docs/COMPLIANCE.md |
