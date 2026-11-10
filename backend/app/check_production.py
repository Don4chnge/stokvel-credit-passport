"""Refuse to run in production with unsafe settings.  python -m app.check_production"""
import sys

from .config import Settings, get_settings

WEAK_SECRET_MARKERS = ("change", "secret", "password", "example", "dev-only", "test")


def production_problems(s: Settings) -> list[str]:
    problems: list[str] = []
    if len(s.secret_key) < 40 or any(m in s.secret_key.lower() for m in WEAK_SECRET_MARKERS):
        problems.append("SECRET_KEY must be a random value of at least 40 characters.")
    if not s.cookie_secure:
        problems.append("COOKIE_SECURE must be true so the session cookie is sent over HTTPS only.")
    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    if not origins or any(o == "*" for o in origins):
        problems.append("CORS_ORIGINS must list exact origins. A wildcard is not allowed with credentials.")
    for o in origins + [s.frontend_url]:
        if not o.startswith("https://"):
            problems.append(f"Origin '{o}' must use https.")
    url = s.database_url
    if url.startswith("sqlite"):
        problems.append("DATABASE_URL must point to PostgreSQL in production.")
    elif not any(h in url for h in ("@localhost", "@127.0.0.1")) and "sslmode=require" not in url and "sslmode=verify" not in url:
        problems.append("DATABASE_URL must include sslmode=require so the database connection is encrypted.")
    if not s.rate_limit_enabled:
        problems.append("RATE_LIMIT_ENABLED must be true.")
    if s.bcrypt_rounds < 12:
        problems.append("BCRYPT_ROUNDS must be 12 or more.")
    if s.payment_provider == "test" and not s.payment_test_mode:
        problems.append("PAYMENT_TEST_MODE is false but the only provider is the test provider.")
    if s.trusted_proxy_hops < 1:
        problems.append("TRUSTED_PROXY_HOPS must be set to the number of proxies in front of the API, or rate limits see one shared address.")
    return problems


def main() -> None:
    s = get_settings()
    problems = production_problems(s)
    if problems:
        print("Unsafe production settings:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("Production settings look safe.")


if __name__ == "__main__":
    main()
