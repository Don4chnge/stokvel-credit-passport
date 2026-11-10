# Security checklist: 20 points

What the audit found, what changed, and the test that proves each point. Backend tests are in
`backend/tests/test_hardening.py`. Browser tests are in `frontend/e2e/06-security.spec.ts`.

| # | Point | Audit finding | Now | Proof |
| --- | --- | --- | --- | --- |
| 1 | Hide API keys | No key in the browser bundle. The only public value is the PostHog project key, which is public by design | Unchanged | `test_1_3_no_secret_or_env_file_is_tracked_in_git` |
| 2 | Check env variables | Settings were read but never validated | The app refuses to start in production with a weak secret, insecure cookie, wildcard or http origin, SQLite, an unencrypted database link, rate limiting off, weak hashing or unset proxy hops. Render runs the same check before each deploy | 13 `test_2_20_*` cases, `python -m app.check_production` |
| 3 | Check keys in git | Full history scanned. Nothing found | CI now scans the whole history on every push (gitleaks) | CI job "Security checks" |
| 4 | Protect admin routes | Already enforced on the server | Unchanged | e2e 06 "4 and 6", `test_security.py` |
| 5 | Add auth | Present. No lock after repeated wrong passwords | Sign-in locks for 15 minutes after 5 failures, for real and unknown emails alike. A lock also ends open sessions | `test_5_11_account_locks...`, e2e 06 "5 and 11" |
| 6 | Check user permissions | Already checked on every endpoint, across roles and stokvels | Unchanged | `test_security.py` |
| 7 | Sanitise user inputs | Validated, but free text accepted angle brackets and control characters. A binary body crashed the error handler | Free-text fields refuse markup and control characters. Validation errors no longer echo the submitted value. The crash is fixed | `test_7_8_markup...`, `test_13_large_bodies...` |
| 8 | Protect against XSS | React escapes output and no raw HTML sink exists. No content security policy | Nonce-based policy on every page: no inline scripts, no eval, no framing, no outside connections. Sign-in ignores off-site redirect targets | e2e 06, tests marked 8 |
| 9 | SQL injection | All queries are parameterised. No handwritten SQL | Unchanged, now guarded by a test | `test_9_sql_injection...`, `test_9_no_handwritten_sql...` |
| 10 | Check database rules | The ledger was append-only by convention only | A database trigger rejects UPDATE, DELETE and TRUNCATE on the ledger. A least-privilege role script is provided | `test_10_ledger_rows_cannot_be_updated...`, verified by hand on PostgreSQL 16, `docs/sql/app_role.sql` |
| 11 | Rate limiting | Present, but it trusted a header the caller controls, so it was bypassable | The client address now comes from the trusted proxy position only. Tighter limit on public guessing endpoints. Memory use is bounded | `test_11_*` |
| 12 | Set spend cap | The project uses no paid API | Request bodies are capped at 64 KB and lists are paginated. Billing limits for each host are listed in DEPLOYMENT.md | `test_13_large_bodies...` |
| 13 | Secure file uploads | No endpoint accepts a file | Guarded by a test so an upload is not added by accident | `test_13_large_bodies_and_uploads_are_refused` |
| 14 | CSRF protection | SameSite=Lax cookie only | A browser session may change state only from the site's own origin. Bearer-token clients and signed webhooks are unaffected | `test_14_*`, e2e 06 "14" |
| 15 | Check CORS | Exact origin list with credentials | Unchanged. A wildcard is now refused in production | `test_15_cors...` |
| 16 | Enable HTTPS | Provided by the hosts. No HSTS header | HSTS on the website and the API. Production refuses non-https origins and an unencrypted database link | `test_16_hsts...`, e2e 06 |
| 17 | Security headers | Three headers on the API, four on the website | Full set on both: CSP, HSTS, nosniff, frame deny, referrer, opener and permissions policies. Server banner removed | `test_17_security_headers...`, e2e 06 "8 and 17" |
| 18 | Secure cookies | httpOnly and SameSite. Signing out cleared the browser cookie but the token stayed valid for 8 hours | Signing out now ends the session on the server. Secure flag enforced in production | `test_18_*`, e2e 06 tests marked 18 |
| 19 | Disable debug mode | Debug was off | Explicitly off. Errors return a generic message with no stack trace. Source maps are not published | `test_19_errors_never_expose_internals`, e2e 06 "17 and 19" |
| 20 | Check production settings | No gate | Startup gate (point 2). The demo seed, which uses a published password, is refused in production unless explicitly allowed | `test_20_*` |

Dependencies: `npm audit` and `pip-audit` report no known vulnerabilities as of 10 November 2026. One
advisory in the CSS build tool bundled with Next.js was closed with a version override. CI repeats both
checks on every push and fails when a high-severity advisory appears.

## Still open

- **Rate limits and the sign-in lock live in one process or one table.** Fine for a single instance. Use a
  shared store before scaling out.
- **TRUSTED_PROXY_HOPS must be confirmed after the first deploy.** The right value depends on how many
  proxies sit between a visitor and the API. DEPLOYMENT.md has the check.
- **No multi-factor sign-in, email verification or password reset.**
- **The ledger trigger stops application bugs and casual edits, not a database owner.** Publish ledger
  checkpoints outside the database.
- **No independent penetration test.** Automated tests cover known classes of problem only.
- **The public demo accounts share a published password.** Acceptable only while all data is synthetic.
