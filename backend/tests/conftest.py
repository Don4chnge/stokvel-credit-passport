import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")  # set TEST_DATABASE_URL to run on PostgreSQL
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-0123456789"
os.environ["ENVIRONMENT"] = "test"
os.environ["BCRYPT_ROUNDS"] = "4"

import uuid  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import services  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture(autouse=True)
def clean_db():
    from app.ratelimit import HITS
    HITS.clear()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        services.ensure_reference_data(db)
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class Actor:
    """A signed-in user with its own bearer token, so tests never share cookies."""

    def __init__(self, client: TestClient, token: str, user: dict):
        self.client, self.token, self.user = client, token, user
        self.id = user["id"]

    def _h(self, extra=None):
        return {"Authorization": f"Bearer {self.token}", **(extra or {})}

    def get(self, url, **kw):
        return self.client.get(url, headers=self._h(kw.pop("headers", None)), **kw)

    def post(self, url, json=None, **kw):
        return self.client.post(url, json=json, headers=self._h(kw.pop("headers", None)), **kw)

    def patch(self, url, json=None):
        return self.client.patch(url, json=json, headers=self._h())

    def delete(self, url):
        return self.client.delete(url, headers=self._h())


@pytest.fixture
def make_user(client):
    def _make(name="Test Member", account_type="member", email=None):
        body = {"email": email or f"{uuid.uuid4().hex[:10]}@example.test", "password": PASSWORD,
                "full_name": name, "account_type": account_type,
                "accept_terms": True, "confirm_adult": True}
        if account_type == "lender":
            body["organisation_name"] = "Test Lender"
        r = client.post("/api/v1/auth/register", json=body)
        assert r.status_code == 201, r.text
        client.cookies.clear()
        data = r.json()
        return Actor(client, data["access_token"], data["user"])

    return _make


@pytest.fixture
def world(make_user):
    """An owner, a treasurer and two members in one monthly stokvel."""
    owner, treasurer, alice, bob = (make_user(n) for n in ("Olga Owner", "Tumi Treasurer", "Alice Member", "Bob Member"))
    s = owner.post("/api/v1/stokvels", json={"name": "Test Savers", "frequency": "monthly",
                                             "contribution_amount": "500.00"}).json()
    sid = s["id"]
    for person in (treasurer, alice, bob):
        assert person.post("/api/v1/stokvels/join", json={"join_code": s["join_code"]}).status_code == 201
    members = owner.get(f"/api/v1/stokvels/{sid}/members").json()
    by_name = {m["name"]: m for m in members}
    for name in ("Tumi Treasurer", "Alice Member", "Bob Member"):
        assert owner.post(f"/api/v1/stokvels/{sid}/members/{by_name[name]['membership_id']}/approve").status_code == 200
    r = owner.patch(f"/api/v1/stokvels/{sid}/members/{by_name['Tumi Treasurer']['membership_id']}/role",
                    json={"role": "treasurer"})
    assert r.status_code == 200
    payable = alice.get("/api/v1/members/me/memberships").json()[0]["payable"]
    return {"owner": owner, "treasurer": treasurer, "alice": alice, "bob": bob, "stokvel_id": sid,
            "schedule_id": payable[0]["schedule_id"], "join_code": s["join_code"]}


def contribute(actor, world, channel="self_reported", key=None, schedule_id=None):
    return actor.post("/api/v1/contributions", json={
        "stokvel_id": world["stokvel_id"], "schedule_id": schedule_id or world["schedule_id"], "channel": channel},
        headers={"Idempotency-Key": key or uuid.uuid4().hex})
