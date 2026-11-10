from tests.conftest import PASSWORD


def test_register_creates_member_with_passport_id(client):
    r = client.post("/api/v1/auth/register", json={"email": "New.Member@Example.test", "password": PASSWORD,
                                                   "full_name": "New Member"})
    assert r.status_code == 201
    user = r.json()["user"]
    assert user["email"] == "new.member@example.test" and user["role"] == "member"
    assert user["passport_id"].startswith("SCP-")
    assert "password" not in r.text.lower().replace("password_hash", "")


def test_password_is_hashed_with_bcrypt(client, db):
    from app.models import User
    client.post("/api/v1/auth/register", json={"email": "h@example.test", "password": PASSWORD, "full_name": "Hash Test"})
    u = db.query(User).filter_by(email="h@example.test").one()
    assert u.password_hash.startswith("$2") and PASSWORD not in u.password_hash


def test_duplicate_email_is_rejected(client):
    body = {"email": "dup@example.test", "password": PASSWORD, "full_name": "Dup One"}
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert client.post("/api/v1/auth/register", json=body).status_code == 409


def test_weak_passwords_and_bad_input_are_rejected(client):
    for pw in ("short1", "onlyletterslong", "1234567890123"):
        r = client.post("/api/v1/auth/register", json={"email": "w@example.test", "password": pw, "full_name": "Weak"})
        assert r.status_code == 422
    assert client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": PASSWORD,
                                                      "full_name": "X Y"}).status_code == 422


def test_nobody_can_register_as_platform_admin(client):
    r = client.post("/api/v1/auth/register", json={"email": "a@example.test", "password": PASSWORD,
                                                   "full_name": "Admin Try", "account_type": "platform_admin"})
    assert r.status_code == 422


def test_login_sets_http_only_cookie_and_returns_token(client, make_user):
    u = make_user(email="login@example.test")
    r = client.post("/api/v1/auth/login", json={"email": "login@example.test", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["id"] == u.id
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/v1/auth/me").json()["email"] == "login@example.test"  # cookie session works
    client.post("/api/v1/auth/logout")
    client.cookies.clear()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_wrong_password_and_unknown_email_give_the_same_answer(client, make_user):
    make_user(email="known@example.test")
    a = client.post("/api/v1/auth/login", json={"email": "known@example.test", "password": "Wrong-Passw0rd"})
    b = client.post("/api/v1/auth/login", json={"email": "nobody@example.test", "password": "Wrong-Passw0rd"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_protected_routes_need_authentication(client):
    for url in ("/api/v1/members/me", "/api/v1/members/me/contributions", "/api/v1/stokvels",
                "/api/v1/ledger/verify", "/api/v1/ledger/events", "/api/v1/analytics/fairness",
                "/api/v1/passport/shares", "/api/v1/lender/verifications", "/api/v1/admin/audit-logs"):
        assert client.get(url).status_code == 401, url


def test_forged_and_garbage_tokens_are_rejected(client, make_user):
    import jwt
    u = make_user()
    forged = jwt.encode({"sub": u.id, "role": "platform_admin"}, "another-secret-another-secret-12345", algorithm="HS256")
    for token in (forged, "garbage", ""):
        assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_role_in_token_is_not_trusted(client, make_user):
    """A token claiming a higher role changes nothing. The role is read from the database."""
    import jwt
    from app.config import get_settings
    u = make_user()
    token = jwt.encode({"sub": u.id, "role": "platform_admin"}, get_settings().secret_key, algorithm="HS256")
    assert client.get("/api/v1/analytics/fairness", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_rate_limit_blocks_login_floods(client, monkeypatch):
    from app.config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "rate_limit_enabled", True)
    monkeypatch.setattr(s, "auth_rate_limit_per_minute", 3)
    codes = [client.post("/api/v1/auth/login", json={"email": "x@example.test", "password": "Whatever-123"}).status_code
             for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.json()["payment_mode"] == "TEST MODE"


def test_pilot_interest_needs_consent(client, db):
    from app.models import PilotInterest
    body = {"contact_name": "Zodwa M", "email": "z@example.test", "organisation": "Test Stokvel", "kind": "stokvel",
            "consent_to_contact": False}
    assert client.post("/api/v1/pilot-interest", json=body).status_code == 422
    assert client.post("/api/v1/pilot-interest", json={**body, "consent_to_contact": True}).status_code == 201
    assert db.query(PilotInterest).count() == 1
