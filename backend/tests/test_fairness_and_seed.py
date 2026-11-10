from datetime import date

import pytest
from sqlalchemy import select

from app import fairness, ledger, services
from app.models import Contribution, MemberDemographics, Stokvel, StokvelMembership, User
from app.seed import DEMO_ACCOUNTS, DEMO_PASSWORD, seed


@pytest.fixture
def seeded(db):
    stats = seed(db, today=date(2026, 11, 9))
    return stats


def admin_token(client):
    r = client.post("/api/v1/auth/login", json={"email": DEMO_ACCOUNTS["platform_admin"][0], "password": DEMO_PASSWORD})
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_seed_meets_minimum_population(seeded, db):
    assert seeded["stokvels"] >= 5 and seeded["members"] >= 100 and seeded["pending_reviews"] >= 3
    assert db.query(Stokvel).filter_by(is_synthetic=False).count() == 0
    assert db.query(User).filter_by(is_synthetic=False).count() == 0
    assert {s.frequency for s in db.query(Stokvel)} == {"weekly", "monthly"}
    assert len({s.contribution_amount for s in db.query(Stokvel)}) >= 4
    months = (date(2026, 11, 9) - min(s.due_date for st in db.query(Stokvel) for s in st.schedules)).days / 30
    assert months >= 12


def test_seed_is_internally_consistent(seeded, db):
    assert ledger.verify_database_chain(db)["valid"]
    verified = db.query(Contribution).filter_by(status="verified").all()
    assert all(c.ledger_hash and c.verified_at and c.amount == c.schedule.amount for c in verified)
    for c in db.query(Contribution).filter(Contribution.status != "rejected"):
        m = services.get_membership(db, c.stokvel_id, c.member_id)
        assert m and c.schedule.due_date >= m.joined_on and c.schedule.stokvel_id == c.stokvel_id
    assert db.query(Contribution).filter_by(status="reversed").count() >= 1
    assert seeded["ledger_events"] == len(verified) + 2 * db.query(Contribution).filter_by(status="reversed").count()
    dupes = db.execute(select(Contribution.member_id, Contribution.schedule_id).where(
        Contribution.status == "verified").group_by(Contribution.member_id, Contribution.schedule_id)
        .having(__import__("sqlalchemy").func.count() > 1)).all()
    assert dupes == []


def test_seed_covers_behaviour_types(seeded, db):
    scores = {}
    for u in db.query(User).filter_by(role="member"):
        r = services.compute_score(db, u.id, as_of=date(2026, 11, 9), persist=False)
        if r["counts"]["due"]:
            scores[u.id] = r
    values = [r["score"] for r in scores.values()]
    assert min(values) < 60 and max(values) > 90
    assert any(r["counts"]["missed"] and r["recovered_misses"] for r in scores.values())
    assert any(r["provisional"] or r["participation_months"] <= 4 for r in scores.values())
    assert any(r["participation_months"] >= 20 for r in scores.values())
    assert any(r["stokvel_count"] > 1 for r in scores.values())


def test_demo_member_story(seeded, db):
    u = db.query(User).filter_by(email=DEMO_ACCOUNTS["member"][0]).one()
    r = services.compute_score(db, u.id, as_of=date(2026, 11, 9), persist=False)
    assert r["counts"]["missed"] == 1 and r["recovered_misses"] == 1 and r["counts"]["late"] == 0
    assert 70 <= r["score"] <= 90
    assert "One missed contribution followed by a successful recovery." in r["explanation"]["strengths"]


def test_all_demo_accounts_sign_in(seeded, client):
    for role, (email, _) in DEMO_ACCOUNTS.items():
        r = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert r.status_code == 200, role
        client.cookies.clear()


def test_scores_do_not_change_when_demographics_change(seeded, db):
    """Swap every member's age and gender. Scores must stay identical."""
    members = db.query(User).filter_by(role="member").all()
    as_of = date(2026, 11, 9)
    before = {u.id: services.compute_score(db, u.id, as_of=as_of, persist=False)["score"] for u in members}
    for d in db.query(MemberDemographics):
        d.age_band, d.gender = "55+" if d.age_band != "55+" else "18-24", "Male" if d.gender != "Male" else "Female"
    db.commit()
    after = {u.id: services.compute_score(db, u.id, as_of=as_of, persist=False)["score"] for u in members}
    assert before == after
    db.query(MemberDemographics).delete()
    db.commit()
    assert before == {u.id: services.compute_score(db, u.id, as_of=as_of, persist=False)["score"] for u in members}


def test_obligation_builder_reads_no_demographics(seeded, db):
    import inspect
    src = inspect.getsource(services.build_obligations) + inspect.getsource(services.compute_score)
    assert "MemberDemographics" not in src and "age_band" not in src and "gender" not in src
    import app.scoring as scoring_module
    assert "MemberDemographics" not in inspect.getsource(scoring_module)


def test_fairness_report_structure(seeded, client):
    r = client.get("/api/v1/analytics/fairness", headers=admin_token(client))
    assert r.status_code == 200
    rep = r.json()
    assert rep["members_evaluated"] >= 100 and rep["data_is_synthetic"] is True
    assert rep["protected_attributes_used_in_scoring"] == []
    assert {a["attribute"] for a in rep["attributes"]} == {"age_band", "gender"}
    for a in rep["attributes"]:
        assert sum(g["n"] for g in a["groups"]) == rep["members_evaluated"]
        for g in a["groups"]:
            assert sum(b["count"] for b in g["distribution"]) == g["n"] and 0 <= g["mean"] <= 100
    assert rep["missing_data"]["age_band"]["missing"] >= 1
    assert rep["error_analysis"]["available"] and rep["error_analysis"]["label_is_synthetic"]
    assert any("synthetic" in x.lower() for x in rep["limitations"])
    assert "All evaluated members are synthetic." in rep["flags"]


def test_fairness_report_flags_small_samples(seeded, client):
    rep = client.get("/api/v1/analytics/fairness", headers=admin_token(client)).json()
    small = [g for a in rep["attributes"] for g in a["groups"] if g["n"] < rep["min_group_size"]]
    assert small and all(g["small_sample"] for g in small)
    assert any(f.startswith("Insufficient sample size") for f in rep["flags"])
    gender = next(a for a in rep["attributes"] if a["attribute"] == "gender")
    assert gender["gap_is_reliable"] is False  # the non-binary group is far below 30


def test_fairness_report_never_changes_scores(seeded, db, client):
    u = db.query(User).filter_by(email=DEMO_ACCOUNTS["member"][0]).one()
    before = services.compute_score(db, u.id, persist=False)["score"]
    client.get("/api/v1/analytics/fairness", headers=admin_token(client))
    assert services.compute_score(db, u.id, persist=False)["score"] == before


def test_fairness_without_outcome_label_reports_unavailable(world, db):
    from tests.conftest import contribute
    cid = contribute(world["alice"], world).json()["id"]
    world["treasurer"].post(f"/api/v1/contributions/{cid}/verify")
    # push the paid period into the past so it counts as due
    c = db.get(Contribution, __import__("uuid").UUID(cid))
    c.schedule.due_date = date(2020, 1, 25)
    for m in db.query(StokvelMembership):
        m.joined_on = date(2020, 1, 1)
    db.commit()
    rep = fairness.run_fairness_report(db)
    assert rep["members_evaluated"] >= 1 and rep["error_analysis"]["available"] is False
    assert rep["data_is_synthetic"] is False


def test_treasurer_demo_queue_and_admin_views(seeded, client):
    r = client.post("/api/v1/auth/login", json={"email": DEMO_ACCOUNTS["treasurer"][0], "password": DEMO_PASSWORD})
    client.cookies.clear()
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    sid = r.json()["user"]["manages_stokvels"][0]
    queue = client.get(f"/api/v1/stokvels/{sid}/contributions", params={"status": "pending,under_review"}, headers=h).json()
    assert len(queue) >= 3
    cal = client.get(f"/api/v1/stokvels/{sid}/calendar", headers=h).json()
    assert len(cal) >= 12 and all(row["verified"] <= row["eligible"] for row in cal)
    status = client.get("/api/v1/ledger/status", headers=admin_token(client)).json()
    assert status["valid"] and status["event_count"] > 1500 and len(status["recent_events"]) == 12
    assert status["checkpoint_count"] >= 1
