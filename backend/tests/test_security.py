"""Authorisation and data-leak tests across roles and tenants."""
import uuid

from tests.conftest import contribute


def test_member_sees_only_own_contributions(world):
    contribute(world["alice"], world)
    assert len(world["alice"].get("/api/v1/members/me/contributions").json()) == 1
    assert world["bob"].get("/api/v1/members/me/contributions").json() == []


def test_member_cannot_read_another_members_receipt(world):
    cid = contribute(world["alice"], world).json()["id"]
    assert world["alice"].get(f"/api/v1/contributions/{cid}/receipt").status_code == 200
    assert world["bob"].get(f"/api/v1/contributions/{cid}/receipt").status_code == 404
    assert world["treasurer"].get(f"/api/v1/contributions/{cid}/receipt").status_code == 200


def test_plain_member_cannot_list_group_contributions_or_calendar(world):
    sid = world["stokvel_id"]
    for url in (f"/api/v1/stokvels/{sid}/contributions", f"/api/v1/stokvels/{sid}/calendar"):
        assert world["bob"].get(url).status_code == 403
        assert world["treasurer"].get(url).status_code == 200


def test_member_list_hides_emails_and_totals_from_plain_members(world):
    sid = world["stokvel_id"]
    plain = world["bob"].get(f"/api/v1/stokvels/{sid}/members").json()
    assert plain and all(set(m) == {"membership_id", "name", "role", "status", "joined_on"} for m in plain)
    assert "email" in world["owner"].get(f"/api/v1/stokvels/{sid}/members").json()[0]
    assert "join_code" not in world["bob"].get(f"/api/v1/stokvels/{sid}").json()


def test_outsider_cannot_see_a_stokvel(world, make_user):
    outsider, sid = make_user("Out Sider"), world["stokvel_id"]
    for url in (f"/api/v1/stokvels/{sid}", f"/api/v1/stokvels/{sid}/members",
                f"/api/v1/stokvels/{sid}/contributions", f"/api/v1/stokvels/{sid}/calendar"):
        assert outsider.get(url).status_code == 403
    assert outsider.get("/api/v1/ledger/events", params={"stokvel_id": sid}).status_code == 403


def test_pending_member_has_no_access(world, make_user):
    newcomer, sid = make_user("New Comer"), world["stokvel_id"]
    assert newcomer.post("/api/v1/stokvels/join", json={"join_code": world["join_code"]}).json()["status"] == "pending"
    assert newcomer.get(f"/api/v1/stokvels/{sid}").status_code == 403
    assert contribute(newcomer, world).status_code == 403


def test_role_based_member_management(world, make_user):
    sid = world["stokvel_id"]
    members = world["owner"].get(f"/api/v1/stokvels/{sid}/members").json()
    bob = next(m for m in members if m["name"] == "Bob Member")
    alice = next(m for m in members if m["name"] == "Alice Member")
    owner = next(m for m in members if m["role"] == "owner")
    # a treasurer verifies contributions but does not manage members or roles
    assert world["treasurer"].delete(f"/api/v1/stokvels/{sid}/members/{bob['membership_id']}").status_code == 403
    assert world["treasurer"].patch(f"/api/v1/stokvels/{sid}/members/{bob['membership_id']}/role",
                                    json={"role": "treasurer"}).status_code == 403
    assert world["alice"].patch(f"/api/v1/stokvels/{sid}/members/{alice['membership_id']}/role",
                                json={"role": "owner"}).status_code == 403
    # an administrator manages members but does not verify or assign roles
    assert world["owner"].patch(f"/api/v1/stokvels/{sid}/members/{alice['membership_id']}/role",
                                json={"role": "administrator"}).status_code == 200
    cid = contribute(world["bob"], world).json()["id"]
    assert world["alice"].post(f"/api/v1/contributions/{cid}/verify").status_code == 403
    assert world["alice"].delete(f"/api/v1/stokvels/{sid}/members/{owner['membership_id']}").status_code == 409
    assert world["alice"].delete(f"/api/v1/stokvels/{sid}/members/{bob['membership_id']}").status_code == 200
    assert contribute(world["bob"], world).status_code == 403  # removed members lose access
    assert world["owner"].patch(f"/api/v1/stokvels/{sid}/members/{owner['membership_id']}/role",
                                json={"role": "member"}).status_code == 409


def test_membership_id_from_another_stokvel_is_rejected(world, make_user):
    other = make_user("Other Owner")
    other_sid = other.post("/api/v1/stokvels", json={"name": "Other Group", "contribution_amount": "100.00"}).json()["id"]
    foreign = other.get(f"/api/v1/stokvels/{other_sid}/members").json()[0]["membership_id"]
    assert world["owner"].delete(f"/api/v1/stokvels/{world['stokvel_id']}/members/{foreign}").status_code == 404


def test_ledger_events_are_scoped(world, make_user):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    assert len(world["alice"].get("/api/v1/ledger/events").json()) == 1
    assert world["bob"].get("/api/v1/ledger/events").json() == []
    assert world["bob"].get("/api/v1/ledger/events", params={"stokvel_id": world["stokvel_id"]}).status_code == 403
    assert len(world["treasurer"].get("/api/v1/ledger/events", params={"stokvel_id": world["stokvel_id"]}).json()) == 1
    lender = make_user("Lena Lender", "lender")
    assert lender.get("/api/v1/ledger/events").status_code == 403


def test_lender_cannot_reach_member_or_stokvel_endpoints(world, make_user):
    lender, sid = make_user("Lena Lender", "lender"), world["stokvel_id"]
    for url in ("/api/v1/members/me", "/api/v1/members/me/contributions", "/api/v1/stokvels",
                f"/api/v1/stokvels/{sid}", f"/api/v1/stokvels/{sid}/members", "/api/v1/passport/shares"):
        assert lender.get(url).status_code == 403, url


def test_member_cannot_reach_lender_or_admin_endpoints(world):
    for url in ("/api/v1/lender/verifications", "/api/v1/analytics/fairness", "/api/v1/ledger/status",
                "/api/v1/admin/audit-logs"):
        assert world["alice"].get(url).status_code == 403, url
    assert world["alice"].post("/api/v1/ledger/checkpoints").status_code == 403


def test_tamper_simulation_needs_a_management_role(world):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    assert world["alice"].post("/api/v1/ledger/tamper-simulation", json={}).status_code == 403
    r = world["treasurer"].post("/api/v1/ledger/tamper-simulation", json={})
    assert r.status_code == 200 and r.json()["after_edit"]["valid"] is False
    assert world["alice"].get("/api/v1/ledger/verify").json()["valid"] is True


def test_period_from_another_stokvel_is_rejected(world, make_user):
    other = make_user("Other Owner")
    other.post("/api/v1/stokvels", json={"name": "Other Group", "contribution_amount": "100.00"})
    foreign_schedule = other.get("/api/v1/members/me/memberships").json()[0]["payable"][0]["schedule_id"]
    assert contribute(world["alice"], world, schedule_id=foreign_schedule).status_code == 404


def test_input_validation(world):
    owner = world["owner"]
    for body in ({"name": "No", "contribution_amount": "100"}, {"name": "Negative", "contribution_amount": "-5"},
                 {"name": "Float precision", "contribution_amount": "10.999"},
                 {"name": "Bad frequency", "contribution_amount": "10", "frequency": "daily"}):
        assert owner.post("/api/v1/stokvels", json=body).status_code == 422, body
    r = world["alice"].post("/api/v1/contributions", json={"stokvel_id": world["stokvel_id"],
                                                          "schedule_id": world["schedule_id"],
                                                          "reference": "<script>alert(1)</script>"},
                            headers={"Idempotency-Key": uuid.uuid4().hex})
    assert r.status_code == 422


def test_errors_do_not_leak_internals(client):
    r = client.get("/api/v1/passport/verify/%27%20OR%201=1--")
    assert r.status_code == 200 and r.json()["authentic"] is False


def test_money_is_stored_as_decimal(world, db):
    from decimal import Decimal
    from app.models import Contribution
    contribute(world["alice"], world)
    assert isinstance(db.query(Contribution).one().amount, Decimal)
