import uuid

from app import ledger
from app.models import AuditLog, LedgerEvent, PaymentProviderEvent
from tests.conftest import contribute


def test_member_creates_self_reported_contribution(world):
    r = contribute(world["alice"], world)
    assert r.status_code == 201
    c = r.json()
    assert c["status"] == "pending" and c["verification_method"] == "self_reported"
    assert c["amount"] == "500.00" and c["ledger_hash"] is None


def test_self_reported_contribution_never_enters_ledger_until_verified(world, db):
    contribute(world["alice"], world)
    assert db.query(LedgerEvent).count() == 0


def test_idempotency_key_returns_the_same_record(world):
    a = contribute(world["alice"], world, key="same-key-12345").json()
    b = contribute(world["alice"], world, key="same-key-12345").json()
    assert a["id"] == b["id"] and a["created"] is True and b["created"] is False


def test_duplicate_period_is_rejected(world):
    assert contribute(world["alice"], world).status_code == 201
    assert contribute(world["alice"], world).status_code == 409


def test_idempotency_header_is_required(world):
    r = world["alice"].post("/api/v1/contributions", json={"stokvel_id": world["stokvel_id"],
                                                          "schedule_id": world["schedule_id"]})
    assert r.status_code == 422


def test_non_member_cannot_contribute(world, make_user):
    outsider = make_user("Out Sider")
    assert contribute(outsider, world).status_code == 403


def test_treasurer_verifies_and_ledger_event_is_written(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    r = world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    assert r.status_code == 200
    c = r.json()
    assert c["status"] == "verified" and c["verification_method"] == "manually_verified"
    ev = db.query(LedgerEvent).one()
    assert ev.current_hash == c["ledger_hash"] and ev.event_type == ledger.EVENT_VERIFIED
    assert ev.amount == "500.00" and str(ev.contribution_id) == cid
    assert ledger.verify_database_chain(db)["valid"]


def test_verifying_twice_writes_one_ledger_event(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    assert db.query(LedgerEvent).count() == 1


def test_plain_member_cannot_verify(world):
    cid = contribute(world["alice"], world).json()["id"]
    assert world["bob"].post(f"/api/v1/contributions/{cid}/verify").status_code == 403
    assert world["alice"].post(f"/api/v1/contributions/{cid}/verify").status_code == 403


def test_treasurer_cannot_verify_own_contribution(world):
    cid = contribute(world["treasurer"], world).json()["id"]
    assert world["treasurer"].post(f"/api/v1/contributions/{cid}/verify").status_code == 403
    assert world["owner"].post(f"/api/v1/contributions/{cid}/verify").status_code == 200


def test_treasurer_of_another_stokvel_cannot_verify(world, make_user):
    other = make_user("Other Owner")
    other.post("/api/v1/stokvels", json={"name": "Other Group", "contribution_amount": "100.00"})
    cid = contribute(world["alice"], world).json()["id"]
    assert other.post(f"/api/v1/contributions/{cid}/verify").status_code == 403


def test_reject_keeps_ledger_empty_and_allows_resubmission(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    r = world["treasurer"].post(f"/api/v1/contributions/{cid}/reject", json={"note": "No matching deposit"})
    assert r.json()["status"] == "rejected" and db.query(LedgerEvent).count() == 0
    assert contribute(world["alice"], world).status_code == 201


def test_reversal_appends_a_new_event_and_keeps_the_original(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    original = ledger.event_to_dict(db.query(LedgerEvent).one())
    r = world["treasurer"].post(f"/api/v1/contributions/{cid}/reverse", json={"note": "Paid twice"})
    assert r.json()["status"] == "reversed"
    events = ledger.load_events(db)
    assert len(events) == 2 and events[0] == original
    assert events[1]["event_type"] == ledger.EVENT_REVERSED and events[1]["previous_hash"] == original["current_hash"]
    assert ledger.verify_chain(events)["valid"]


def test_only_verified_contributions_can_be_reversed(world):
    cid = contribute(world["alice"], world).json()["id"]
    assert world["treasurer"].post(f"/api/v1/contributions/{cid}/reverse", json={}).status_code == 409


def test_member_reports_incorrect_record(world):
    cid = contribute(world["alice"], world).json()["id"]
    r = world["alice"].post(f"/api/v1/contributions/{cid}/dispute", json={"note": "The amount is wrong"})
    assert r.json()["status"] == "under_review" and "amount is wrong" in r.json()["review_note"]
    assert world["bob"].post(f"/api/v1/contributions/{cid}/dispute", json={"note": "Not my record"}).status_code == 404


def test_disputing_a_verified_record_does_not_edit_it(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    before = ledger.load_events(db)
    r = world["alice"].post(f"/api/v1/contributions/{cid}/dispute", json={"note": "I think the date is wrong"})
    assert r.json()["status"] == "verified"
    assert ledger.load_events(db) == before


# ---------------------------------------------------------------- payments (TEST MODE)
def test_payshap_request_stays_pending_until_provider_confirms(world, db):
    c = contribute(world["alice"], world, channel="payshap_request").json()
    assert c["status"] == "pending" and c["reference"].startswith("TEST-PSR-") and c["test_mode"] is True
    assert db.query(LedgerEvent).count() == 0


def test_simulated_success_confirms_and_writes_ledger(world, db):
    cid = contribute(world["alice"], world, channel="payshap_request").json()["id"]
    r = world["alice"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "success"})
    assert r.status_code == 200
    body = r.json()
    assert body["contribution"]["status"] == "verified" and body["contribution"]["verification_method"] == "provider_confirmed"
    assert body["test_mode"] is True and db.query(LedgerEvent).count() == 1
    receipt = world["alice"].get(f"/api/v1/contributions/{cid}/receipt").json()
    assert receipt["payment"] == {"provider": "test", "provider_reference": body["contribution"]["reference"],
                                  "status": "succeeded", "test_mode": True}


def test_simulated_failure_rejects_and_writes_nothing(world, db):
    cid = contribute(world["alice"], world, channel="payshap_request").json()["id"]
    r = world["alice"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "fail"})
    assert r.json()["contribution"]["status"] == "rejected" and db.query(LedgerEvent).count() == 0


def test_provider_reversal_creates_reversal_event(world, db):
    cid = contribute(world["alice"], world, channel="payshap_request").json()["id"]
    world["alice"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "success"})
    r = world["alice"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "reverse"})
    assert r.json()["contribution"]["status"] == "reversed"
    assert [e["event_type"] for e in ledger.load_events(db)] == [ledger.EVENT_VERIFIED, ledger.EVENT_REVERSED]


def test_duplicate_webhook_is_processed_once(world, client, db):
    from app.payments import get_provider
    c = contribute(world["alice"], world, channel="payshap_request").json()
    provider = get_provider("test")
    headers, body = provider.build_event(c["reference"], "success", event_id="evt_fixed_1")
    first = client.post("/api/v1/payments/webhook/test", content=body, headers=headers)
    second = client.post("/api/v1/payments/webhook/test", content=body, headers=headers)
    assert first.json()["status"] == "processed" and second.json()["status"] == "duplicate_ignored"
    assert db.query(LedgerEvent).count() == 1 and db.query(PaymentProviderEvent).count() == 1


def test_webhook_with_bad_signature_is_rejected(world, client, db):
    from app.payments import get_provider
    c = contribute(world["alice"], world, channel="payshap_request").json()
    _, body = get_provider("test").build_event(c["reference"], "success")
    r = client.post("/api/v1/payments/webhook/test", content=body, headers={"x-scp-signature": "0" * 64})
    assert r.status_code == 400 and db.query(LedgerEvent).count() == 0
    assert client.post("/api/v1/payments/webhook/unknown", content=body).status_code == 400


def test_member_cannot_simulate_someone_elses_payment(world):
    cid = contribute(world["alice"], world, channel="payshap_request").json()["id"]
    assert world["bob"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "success"}).status_code == 404


def test_simulation_is_blocked_outside_test_mode(world, monkeypatch):
    from app.config import get_settings
    cid = contribute(world["alice"], world, channel="payshap_request").json()["id"]
    monkeypatch.setattr(get_settings(), "payment_test_mode", False)
    assert world["alice"].post(f"/api/v1/payments/{cid}/simulate", json={"outcome": "success"}).status_code == 403


def test_unknown_provider_is_refused():
    import pytest
    from app.payments import get_provider
    with pytest.raises(RuntimeError):
        get_provider("stitch")


def test_actions_are_audited(world, db):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    actions = {a.action for a in db.query(AuditLog).all()}
    assert {"user.registered", "stokvel.created", "contribution.created", "contribution.verified"} <= actions


def test_passport_score_updates_after_verification(world):
    before = world["alice"].get("/api/v1/members/me").json()["score"]["counts"]["verified_records"]
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    me = world["alice"].get("/api/v1/members/me").json()
    assert before == 0 and me["successful_payments"] == 1 and me["total_verified"] == "500.00"


def test_unknown_ids_return_404(world):
    assert world["treasurer"].post(f"/api/v1/contributions/{uuid.uuid4()}/verify").status_code == 404
    assert world["treasurer"].post("/api/v1/contributions/not-a-uuid/verify").status_code == 404
