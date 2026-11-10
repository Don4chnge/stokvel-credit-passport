from datetime import timedelta

from app.models import PassportAccessLog, PassportConsent, utcnow
from app.security import hash_token
from tests.conftest import contribute

ALL = ["index", "explanation", "totals", "history", "memberships"]


def verified_member(world):
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    return world["alice"]


def share(member, scopes=None, days=7):
    r = member.post("/api/v1/passport/share", json={"scopes": scopes or ALL, "expires_in_days": days,
                                                    "recipient_label": "Test Lender"})
    assert r.status_code == 201, r.text
    return r.json()


def test_passport_is_generated_with_disclaimer_and_provenance(world):
    alice = verified_member(world)
    assert alice.get("/api/v1/members/me/passport").status_code == 404
    p = alice.post("/api/v1/members/me/passport").json()
    assert p["passport_id"].startswith("SCP-") and p["member_name"] == "Alice Member"
    assert "not a credit bureau score" in p["disclaimer"] and "does not guarantee credit approval" in p["disclaimer"]
    assert len(p["provenance"]["ledger_head_hash"]) == 64 and p["totals"]["verified_count"] == 1
    assert p["history"][0]["ledger_hash"] and p["index"]["model_version"] == "cri-1.0.0"
    assert alice.get("/api/v1/members/me/passport").json()["id"] == p["id"]


def test_passport_pdf_downloads(world):
    alice = verified_member(world)
    alice.post("/api/v1/members/me/passport")
    r = alice.get("/api/v1/members/me/passport/pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:5] == b"%PDF-"


def test_share_stores_only_a_token_hash(world, db):
    alice = verified_member(world)
    s = share(alice)
    consent = db.query(PassportConsent).one()
    assert consent.token_hash == hash_token(s["token"]) and s["token"] not in consent.token_hash
    assert len(s["token"]) >= 40
    listing = alice.get("/api/v1/passport/shares").json()
    assert listing[0]["state"] == "active" and s["token"] not in str(listing)


def test_lender_sees_only_authorised_scopes(world, make_user):
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice, scopes=["index"])
    view = lender.get(f"/api/v1/passport/shared/{s['token']}").json()
    assert view["authentic"] and view["index"]["score"] >= 0 and view["scopes"] == ["index"]
    for hidden in ("history", "totals", "memberships", "explanation"):
        assert hidden not in view
    assert "factors" not in view["index"]
    assert "id" not in view and "member_id" not in view and "email" not in str(view)


def test_full_scope_view_and_lender_report_download(world, make_user):
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice)
    view = lender.get(f"/api/v1/passport/shared/{s['token']}").json()
    assert view["history"] and view["totals"]["verified_count"] == 1 and view["explanation"]["headline"]
    pdf = lender.get(f"/api/v1/passport/shared/{s['token']}/pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"


def test_access_is_logged_and_visible_to_member(world, make_user, db):
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice)
    lender.get(f"/api/v1/passport/shared/{s['token']}")
    log = alice.get("/api/v1/passport/shares").json()[0]["access_log"]
    assert len(log) == 1 and log[0]["outcome"] == "granted" and log[0]["organisation"] == "Test Lender"
    assert db.query(PassportAccessLog).count() == 1


def test_revoked_access_is_refused_and_logged(world, make_user):
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice)
    assert lender.get(f"/api/v1/passport/shared/{s['token']}").status_code == 200
    assert alice.delete(f"/api/v1/passport/share/{s['id']}").json()["state"] == "revoked"
    r = lender.get(f"/api/v1/passport/shared/{s['token']}")
    assert r.status_code == 410 and "revoked" in r.json()["detail"]
    assert lender.get(f"/api/v1/passport/shared/{s['token']}/pdf").status_code == 410
    outcomes = [x["outcome"] for x in alice.get("/api/v1/passport/shares").json()[0]["access_log"]]
    assert outcomes.count("revoked") == 2 and outcomes.count("granted") == 1


def test_expired_access_is_refused(world, make_user, db):
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice, days=1)
    consent = db.query(PassportConsent).one()
    consent.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    r = lender.get(f"/api/v1/passport/shared/{s['token']}")
    assert r.status_code == 410 and "expired" in r.json()["detail"]
    assert alice.get("/api/v1/passport/shares").json()[0]["state"] == "expired"


def test_invalid_token_is_404(world, make_user):
    lender = make_user("Lena Lender", "lender")
    assert lender.get("/api/v1/passport/shared/" + "x" * 43).status_code == 404


def test_only_lenders_open_shared_links(world, client):
    alice = verified_member(world)
    s = share(alice)
    assert client.get(f"/api/v1/passport/shared/{s['token']}").status_code == 401
    assert world["bob"].get(f"/api/v1/passport/shared/{s['token']}").status_code == 403


def test_member_cannot_revoke_someone_elses_consent(world):
    alice = verified_member(world)
    s = share(alice)
    assert world["bob"].delete(f"/api/v1/passport/share/{s['id']}").status_code == 404
    assert alice.get("/api/v1/passport/shares").json()[0]["state"] == "active"


def test_scope_and_expiry_validation(world):
    alice = verified_member(world)
    bad = [{"scopes": ["index", "bank_account"], "expires_in_days": 7, "recipient_label": "X Lender"},
           {"scopes": [], "expires_in_days": 7, "recipient_label": "X Lender"},
           {"scopes": ["index"], "expires_in_days": 0, "recipient_label": "X Lender"},
           {"scopes": ["index"], "expires_in_days": 400, "recipient_label": "X Lender"}]
    for body in bad:
        assert alice.post("/api/v1/passport/share", json=body).status_code == 422


def test_shared_view_is_a_snapshot_of_the_report(world, make_user):
    """A lender sees the report the member shared. Later activity needs a new Passport and a new share."""
    alice, lender = verified_member(world), make_user("Lena Lender", "lender")
    s = share(alice)
    first = lender.get(f"/api/v1/passport/shared/{s['token']}").json()
    alice.post("/api/v1/members/me/passport")
    again = lender.get(f"/api/v1/passport/shared/{s['token']}").json()
    assert first["verification_code"] == again["verification_code"]


def test_lender_verification_record(world, make_user):
    alice, lender, other = verified_member(world), make_user("Lena Lender", "lender"), make_user("Otto Other", "lender")
    s = share(alice)
    vid = lender.get(f"/api/v1/passport/shared/{s['token']}").json()["verification_id"]
    rec = lender.get(f"/api/v1/lender/verifications/{vid}").json()
    assert rec["outcome"] == "granted" and rec["consent_state"] == "active" and rec["passport_id"].startswith("SCP-")
    assert other.get(f"/api/v1/lender/verifications/{vid}").status_code == 404
    assert len(lender.get("/api/v1/lender/verifications").json()) == 1 and other.get("/api/v1/lender/verifications").json() == []
    alice.delete(f"/api/v1/passport/share/{s['id']}")
    assert "passport_id" not in lender.get(f"/api/v1/lender/verifications/{vid}").json()


def test_public_verification_reveals_no_financial_detail(world, client):
    alice = verified_member(world)
    p = alice.post("/api/v1/members/me/passport").json()
    v = client.get(f"/api/v1/passport/verify/{p['verification_code']}").json()
    assert v["authentic"] and v["holder_initials"] == "A.M." and v["passport_id"] == p["passport_id"]
    assert not {"index", "totals", "history", "member_name"} & set(v)
    assert client.get("/api/v1/passport/verify/NOPE").json()["authentic"] is False


def test_member_data_export_and_deletion_request(world, db):
    alice = verified_member(world)
    share(alice)
    data = alice.get("/api/v1/members/me/export").json()
    assert data["account"]["email"] and len(data["contributions"]) == 1 and len(data["sharing"]) == 1
    assert alice.post("/api/v1/members/me/deletion-request").status_code == 202
