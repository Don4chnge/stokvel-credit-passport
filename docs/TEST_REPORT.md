# Test report

Last full run: 10 November 2026, in the build environment (Linux, Python 3.13, Node.js 22, Chromium via
Playwright 1.63, PostgreSQL 16).

| Suite | Command | Result |
| --- | --- | --- |
| Backend on SQLite | `cd backend && pytest -q` | 120 passed |
| Backend on PostgreSQL 16 | `TEST_DATABASE_URL=postgresql://... pytest -q` | 120 passed |
| Migration | `alembic upgrade head` on an empty PostgreSQL database, then seed and verify the chain | Applied. Chain valid |
| Frontend types | `npm run lint` | No errors |
| Frontend unit tests | `npm test` | 21 passed |
| Frontend production build | `npm run build` | 21 routes built |
| End to end, desktop | `npm run e2e` | 37 passed |
| End to end, mobile (Pixel 7) | `npm run e2e` | 3 passed |

Not run: GitHub Actions. The workflow in `.github/workflows/ci.yml` runs the same commands and has not
executed yet because the code has not been pushed to GitHub.

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
