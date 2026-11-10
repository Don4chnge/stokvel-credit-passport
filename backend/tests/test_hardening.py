"""Security hardening. Test names carry the checklist number from docs/SECURITY_CHECKLIST.md."""
import subprocess
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app import ledger
from app.check_production import production_problems
from app.config import Settings, get_settings
from app.db import engine
from app.db_rules import install_ledger_guards, remove_ledger_guards
from tests.conftest import PASSWORD, contribute

ORIGIN = {"Origin": "http://localhost:3000"}
REPO = Path(__file__).resolve().parents[2]
SAFE = dict(secret_key="k9Jv2mQx7Lw4Rz8Tn3Yb6Hd1Fg5Sc0Pa9Ue2Xi7Vo4Wq", cookie_secure=True, environment="production",
            cors_origins="https://app.example.co.za", frontend_url="https://app.example.co.za",
            database_url="postgresql://u:p@db.example.co.za/scp?sslmode=require", trusted_proxy_hops=1,
            rate_limit_enabled=True, bcrypt_rounds=12, payment_test_mode=True, payment_provider="test")


# ---------------------------------------------------------------- 1, 2, 3, 19, 20: secrets and production settings
def test_1_3_no_secret_or_env_file_is_tracked_in_git():
    files = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True).stdout.split()
    assert files, "run from a git checkout"
    assert not [f for f in files if f.endswith((".env", ".env.local", ".pem", ".key", ".db")) or "credentials" in f.lower()]
    example = (REPO / ".env.example").read_text()
    for line in example.splitlines():
        if line.startswith("SECRET_KEY") or "POSTHOG_KEY" in line:
            assert line.split("=", 1)[1].strip() == "", "the example file must hold no real value"


def test_2_20_safe_production_settings_pass():
    assert production_problems(Settings(**SAFE)) == []


@pytest.mark.parametrize("override, expected", [
    (dict(secret_key="dev-only-change-me-dev-only-change-me"), "SECRET_KEY"),
    (dict(secret_key="short"), "SECRET_KEY"),
    (dict(cookie_secure=False), "COOKIE_SECURE"),
    (dict(cors_origins="*"), "wildcard"),
    (dict(cors_origins="http://app.example.co.za"), "https"),
    (dict(frontend_url="http://app.example.co.za"), "https"),
    (dict(database_url="sqlite:///./x.db"), "PostgreSQL"),
    (dict(database_url="postgresql://u:p@db.example.co.za/scp"), "sslmode=require"),
    (dict(rate_limit_enabled=False), "RATE_LIMIT_ENABLED"),
    (dict(bcrypt_rounds=4), "BCRYPT_ROUNDS"),
    (dict(payment_test_mode=False), "PAYMENT_TEST_MODE"),
    (dict(trusted_proxy_hops=0), "TRUSTED_PROXY_HOPS"),
])
def test_2_20_each_unsafe_production_setting_is_caught(override, expected):
    problems = production_problems(Settings(**{**SAFE, **override}))
    assert any(expected in p for p in problems), problems


def test_20_the_app_refuses_to_start_in_production_with_unsafe_settings(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    monkeypatch.setattr(main.settings, "environment", "production")
    with pytest.raises(RuntimeError, match="Unsafe production settings"):
        with TestClient(main.app):
            pass


def test_20_demo_seed_is_refused_in_production(monkeypatch):
    from app import seed
    s = get_settings()
    monkeypatch.setattr(s, "environment", "production")
    monkeypatch.setattr(s, "allow_demo_seed", False)
    monkeypatch.setattr("sys.argv", ["seed"])
    with pytest.raises(SystemExit, match="Refusing to seed production"):
        seed.main()


def test_19_errors_never_expose_internals(client, monkeypatch):
    from app.routers import auth
    monkeypatch.setattr(auth, "serialize_user", lambda *a, **k: 1 / 0)
    make = {"email": "boom@example.test", "password": PASSWORD, "full_name": "Boom Test", "accept_terms": True, "confirm_adult": True}
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app, raise_server_exceptions=False) as quiet:
        r = quiet.post("/api/v1/auth/register", json=make)
    assert r.status_code == 500 and r.json() == {"detail": "Something went wrong. Try again."}
    assert "Traceback" not in r.text and "ZeroDivision" not in r.text
    from app.main import app as fastapi_app
    assert fastapi_app.debug is False


# ---------------------------------------------------------------- 5, 11, 18: sign-in, lockout, sessions
def test_5_11_account_locks_after_repeated_failures_and_reveals_nothing(client, make_user):
    make_user(email="lock@example.test")
    for target in ("lock@example.test", "ghost@example.test"):  # same behaviour for a real and an unknown email
        codes = [client.post("/api/v1/auth/login", json={"email": target, "password": "Wrong-Passw0rd"}).status_code for _ in range(6)]
        assert codes == [401, 401, 401, 401, 401, 429], target
    r = client.post("/api/v1/auth/login", json={"email": "lock@example.test", "password": PASSWORD})
    assert r.status_code == 429 and "Too many failed attempts" in r.json()["detail"] and r.headers["retry-after"] == "900"


def test_5_lock_expires_and_a_good_sign_in_resets_the_counter(client, make_user, db):
    from datetime import timedelta
    from app.models import LoginThrottle, utcnow
    make_user(email="reset@example.test")
    for _ in range(4):
        client.post("/api/v1/auth/login", json={"email": "reset@example.test", "password": "Wrong-Passw0rd"})
    assert client.post("/api/v1/auth/login", json={"email": "reset@example.test", "password": PASSWORD}).status_code == 200
    client.cookies.clear()
    assert db.query(LoginThrottle).one().failures == 0
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "reset@example.test", "password": "Wrong-Passw0rd"})
    row = db.query(LoginThrottle).one()
    db.refresh(row)
    row.locked_until = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.post("/api/v1/auth/login", json={"email": "reset@example.test", "password": PASSWORD}).status_code == 200


def test_18_sign_out_kills_the_token_everywhere(client, make_user):
    u = make_user()
    assert u.get("/api/v1/auth/me").status_code == 200
    assert u.post("/api/v1/auth/logout").status_code == 204
    assert u.get("/api/v1/auth/me").status_code == 401  # the old token is dead, not only the cookie
    r = client.post("/api/v1/auth/login", json={"email": u.user["email"], "password": PASSWORD})
    assert r.status_code == 200
    client.cookies.clear()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200


def test_5_a_lock_also_ends_open_sessions(client, make_user):
    u = make_user(email="hijack@example.test")
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "hijack@example.test", "password": "Wrong-Passw0rd"})
    assert u.get("/api/v1/auth/me").status_code == 401


def test_18_session_cookie_attributes(client, make_user, monkeypatch):
    make_user(email="cookie@example.test")
    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    r = client.post("/api/v1/auth/login", json={"email": "cookie@example.test", "password": PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    for attribute in ("httponly", "secure", "samesite=lax", "path=/", "max-age=28800"):
        assert attribute in cookie, attribute
    assert "domain=" not in cookie  # host-only


# ---------------------------------------------------------------- 14, 15: CSRF and CORS
def test_14_cookie_session_cannot_change_state_from_another_origin(client, make_user, world):
    client.post("/api/v1/auth/login", json={"email": world["alice"].user["email"], "password": PASSWORD})
    assert client.get("/api/v1/auth/me").status_code == 200  # reads are unaffected
    body = {"scopes": ["index"], "expires_in_days": 7, "recipient_label": "Evil Site"}
    assert client.post("/api/v1/passport/share", json=body).status_code == 403                                   # no origin
    assert client.post("/api/v1/passport/share", json=body, headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.post("/api/v1/passport/share", json=body, headers={"Referer": "https://evil.example/x"}).status_code == 403
    assert client.post("/api/v1/passport/share", json=body, headers={"Origin": "http://localhost:3000.evil.example"}).status_code == 403
    assert client.post("/api/v1/passport/share", json=body, headers=ORIGIN).status_code == 201                  # our own site
    assert client.post("/api/v1/passport/share", json=body, headers={"Referer": "http://localhost:3000/member/sharing"}).status_code == 201
    assert client.delete("/api/v1/members/me/deletion-request", headers={"Origin": "https://evil.example"}).status_code == 403


def test_14_bearer_clients_and_webhooks_are_not_blocked_by_the_origin_check(world, client):
    assert world["alice"].post("/api/v1/members/me/passport").status_code == 201  # bearer token, no cookie
    assert client.post("/api/v1/payments/webhook/test", content=b"{}").status_code == 400  # reaches the signature check


def test_15_cors_allows_only_the_configured_origin(client):
    ok = client.options("/api/v1/auth/login", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000" and ok.headers["access-control-allow-credentials"] == "true"
    bad = client.options("/api/v1/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers
    assert "access-control-allow-origin" not in client.get("/api/health", headers={"Origin": "https://evil.example"}).headers


# ---------------------------------------------------------------- 7, 8, 9, 13: input, XSS, SQL injection, uploads
@pytest.mark.parametrize("payload", ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "Name\x00Null", "Tab\x07Bell", "a>b"])
def test_7_8_markup_and_control_characters_are_refused_in_free_text(client, world, payload):
    base = {"email": f"{uuid.uuid4().hex[:8]}@example.test", "password": PASSWORD, "accept_terms": True, "confirm_adult": True}
    assert client.post("/api/v1/auth/register", json={**base, "full_name": payload}).status_code == 422
    assert world["owner"].post("/api/v1/stokvels", json={"name": payload + " group", "contribution_amount": "100.00"}).status_code == 422
    assert world["alice"].post("/api/v1/passport/share", json={"scopes": ["index"], "expires_in_days": 7, "recipient_label": payload + " lender"}).status_code == 422
    assert client.post("/api/v1/pilot-interest", json={"contact_name": payload, "email": "a@example.test", "organisation": "Org",
                                                       "kind": "stokvel", "consent_to_contact": True}).status_code == 422
    cid = contribute(world["alice"], world).json()["id"]
    assert world["alice"].post(f"/api/v1/contributions/{cid}/dispute", json={"note": payload + " wrong"}).status_code == 422


def test_7_ordinary_names_with_accents_and_apostrophes_are_accepted(client):
    for name in ["Nokuthula O'Brien", "Thabò Mokoena-Dlamini", "Zoë van der Merwe", "Lindiwe & Sons"]:
        r = client.post("/api/v1/auth/register", json={"email": f"{uuid.uuid4().hex[:8]}@example.test", "password": PASSWORD,
                                                       "full_name": name, "accept_terms": True, "confirm_adult": True})
        assert r.status_code == 201 and r.json()["user"]["full_name"] == name
        client.cookies.clear()


@pytest.mark.parametrize("attack", ["' OR '1'='1", "'; DROP TABLE users; --", "\" OR 1=1 --", "admin'--", "1; SELECT pg_sleep(5)"])
def test_9_sql_injection_strings_are_treated_as_data(client, world, db, attack):
    from app.models import User
    before = db.query(User).count()
    assert client.post("/api/v1/auth/login", json={"email": "x@example.test", "password": attack}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": attack, "password": "whatever-1"}).status_code == 422
    assert world["alice"].post("/api/v1/stokvels/join", json={"join_code": attack[:16]}).status_code == 404
    assert client.get(f"/api/v1/passport/verify/{attack}").json()["authentic"] is False
    assert world["treasurer"].get(f"/api/v1/stokvels/{world['stokvel_id']}/contributions", params={"status": attack}).json() == []
    assert world["alice"].get("/api/v1/ledger/events", params={"stokvel_id": attack}).status_code == 404
    assert db.query(User).count() == before  # nothing dropped, nothing leaked


def test_9_no_handwritten_sql_in_the_application():
    for f in (REPO / "backend" / "app").rglob("*.py"):
        if f.name == "db_rules.py":
            continue  # fixed DDL only, no user input
        src = f.read_text()
        assert "text(" not in src and ".execute(f\"" not in src and "% (" not in src, f.name


def test_13_large_bodies_and_uploads_are_refused(client, world):
    big = {"contact_name": "Big Body", "email": "b@example.test", "organisation": "Org", "kind": "stokvel",
           "consent_to_contact": True, "message": "x" * 70_000}
    assert client.post("/api/v1/pilot-interest", json=big).status_code == 413
    r = client.post("/api/v1/pilot-interest", content=b"x", headers={"Content-Length": "999999999", "Content-Type": "application/json"})
    assert r.status_code == 413
    upload = world["alice"].post("/api/v1/contributions", headers={"Idempotency-Key": uuid.uuid4().hex},
                                 files={"file": ("slip.png", b"\x89PNG fake", "image/png")})
    assert upload.status_code == 422  # no endpoint accepts a file
    assert "PNG" not in upload.text  # and the submitted bytes are not echoed back
    from app.main import app
    for route in app.routes:
        body = getattr(route, "body_field", None)
        assert "UploadFile" not in str(getattr(body, "type_", "")), route.path


# ---------------------------------------------------------------- 11: rate limiting
def test_11_forwarded_header_cannot_be_used_to_dodge_the_rate_limit(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "rate_limit_enabled", True)
    monkeypatch.setattr(s, "auth_rate_limit_per_minute", 3)
    monkeypatch.setattr(s, "trusted_proxy_hops", 0)
    codes = [client.post("/api/v1/auth/login", json={"email": f"x{i}@example.test", "password": "Whatever-123"},
                         headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(5)]
    assert codes == [401, 401, 401, 429, 429]  # a new fake address each time changes nothing


def test_11_behind_a_proxy_the_address_the_proxy_added_is_used():
    from starlette.requests import Request
    from app.net import client_ip
    def req(xff):
        return Request({"type": "http", "headers": [(b"x-forwarded-for", xff.encode())], "client": ("10.9.9.9", 1)})
    s = get_settings()
    old = s.trusted_proxy_hops
    try:
        s.trusted_proxy_hops = 1
        assert client_ip(req("6.6.6.6, 41.13.2.7")) == "41.13.2.7"       # the spoofed left entry is ignored
        s.trusted_proxy_hops = 2
        assert client_ip(req("6.6.6.6, 41.13.2.7, 172.16.0.1")) == "41.13.2.7"
        assert client_ip(req("41.13.2.7")) == "10.9.9.9"                  # too few hops: fall back to the socket
        s.trusted_proxy_hops = 0
        assert client_ip(req("6.6.6.6")) == "10.9.9.9"
    finally:
        s.trusted_proxy_hops = old


def test_11_public_guessing_endpoints_have_a_tighter_limit(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "rate_limit_enabled", True)
    monkeypatch.setattr(s, "sensitive_rate_limit_per_minute", 4)
    codes = [client.get(f"/api/v1/passport/verify/GUESS{i}").status_code for i in range(6)]
    assert codes == [200, 200, 200, 200, 429, 429]
    assert client.get("/api/health").status_code == 200  # other traffic is unaffected


# ---------------------------------------------------------------- 16, 17: transport and headers
def test_17_security_headers_on_every_api_response(client):
    for path in ("/api/health", "/api/v1/auth/me", "/api/v1/passport/verify/X", "/api/nope"):
        h = client.get(path).headers
        assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
        assert h["referrer-policy"] == "no-referrer" and h["cross-origin-opener-policy"] == "same-origin"
        assert "default-src 'none'" in h["content-security-policy"] and "frame-ancestors 'none'" in h["content-security-policy"]
        assert "camera=()" in h["permissions-policy"]
    assert client.get("/api/v1/auth/me").headers["cache-control"] == "no-store"
    assert "server" not in {k.lower() for k in client.get("/api/health").headers} or "uvicorn" not in client.get("/api/health").headers.get("server", "")


def test_16_hsts_is_sent_when_running_over_https(client, monkeypatch):
    assert "strict-transport-security" not in client.get("/api/health").headers
    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    assert client.get("/api/health").headers["strict-transport-security"] == "max-age=63072000; includeSubDomains"


# ---------------------------------------------------------------- 10: database rules
def test_10_ledger_rows_cannot_be_updated_or_deleted_once_the_database_rule_is_installed(db):
    from tests.test_ledger import add
    add(db)
    add(db, "250.00")
    db.commit()
    with engine.begin() as conn:
        install_ledger_guards(conn)
    try:
        for statement in ("UPDATE ledger_events SET amount = '9999.00' WHERE seq = 1", "DELETE FROM ledger_events WHERE seq = 2"):
            with pytest.raises(DBAPIError, match="append-only"):
                with engine.begin() as conn:
                    conn.execute(text(statement))
        if engine.dialect.name == "postgresql":
            with pytest.raises(DBAPIError, match="append-only"):
                with engine.begin() as conn:
                    conn.execute(text("TRUNCATE ledger_events"))
        add(db, "300.00")  # inserts still work
        db.commit()
        assert ledger.verify_database_chain(db)["valid"] and ledger.verify_database_chain(db)["event_count"] == 3
    finally:
        db.rollback()  # release this session's read lock, or the DROP TRIGGER below waits on it forever
        db.close()
        with engine.begin() as conn:
            remove_ledger_guards(conn)


def test_10_least_privilege_role_script_revokes_changes_to_the_append_only_tables():
    from app.db_rules import APP_ROLE_SQL
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON ledger_events, ledger_checkpoints, audit_logs, passport_access_logs FROM scp_app" in APP_ROLE_SQL
