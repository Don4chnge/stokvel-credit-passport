"""Synthetic demonstration data.

Everything created here is invented and flagged is_synthetic. No real person, stokvel or lender
is represented. Run:  python -m app.seed --reset
"""
import argparse
import random
import secrets
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from . import ledger, services
from .db import Base, SessionLocal, engine
from .models import (
    Contribution, ContributionSchedule, LenderAccount, MemberDemographics, MemberProfile, PaymentRequest,
    Stokvel, StokvelMembership, User,
)
from .routers.stokvels import build_schedules
from .security import hash_password, new_passport_id

DEMO_PASSWORD = "Passport-Demo-2026"
DEMO_ACCOUNTS = {
    "member": ("member@demo.stokvelpassport.example", "Nomvula Dlamini"),
    "treasurer": ("treasurer@demo.stokvelpassport.example", "Sipho Mokoena"),
    "administrator": ("admin@demo.stokvelpassport.example", "Lerato Khumalo"),
    "lender": ("lender@demo.stokvelpassport.example", "Demo Lender Analyst"),
    "platform_admin": ("platform@demo.stokvelpassport.example", "Platform Administrator"),
}

FIRST = ["Thandi", "Zanele", "Bongani", "Ayanda", "Lindiwe", "Mpho", "Kagiso", "Nthabiseng", "Themba", "Palesa",
         "Sibusiso", "Nokuthula", "Tshepo", "Busisiwe", "Lungile", "Katlego", "Refilwe", "Mandla", "Dineo", "Vusi",
         "Naledi", "Sizwe", "Khanyisile", "Tebogo", "Nomsa", "Andile", "Boitumelo", "Jabulani", "Precious", "Luyanda",
         "Fatima", "Pieter", "Annelise", "Rajesh", "Priya", "Johan", "Chantal", "Yusuf", "Megan", "Dumisani"]
LAST = ["Nkosi", "Mahlangu", "Zulu", "Ndlovu", "Mthembu", "Sithole", "Molefe", "Tshabalala", "Radebe", "Mabaso",
        "Ngcobo", "Maseko", "Modise", "Cele", "Shabalala", "Mokoena", "Buthelezi", "Khoza", "Motaung", "Zwane",
        "Pillay", "Naidoo", "van der Merwe", "Botha", "Adams", "Jacobs", "Petersen", "Govender", "Mofokeng", "Sibiya"]

GROUPS = [
    # name, purpose, frequency, amount, history periods, members, due day
    ("Masakhane Savings Club", "savings", "monthly", "500.00", 18, 24, 25),
    ("Siyakhula Grocery Stokvel", "groceries", "monthly", "350.00", 12, 24, 1),
    ("Thusanang Burial Society", "burial", "monthly", "200.00", 24, 26, 28),
    ("Vuka Friday Savers", "savings", "weekly", "150.00", 52, 20, None),
    ("Kopano Investment Circle", "investment", "monthly", "1200.00", 14, 20, 15),
]

ARCHETYPES = [("reliable", 0.45), ("steady_late", 0.15), ("recovering", 0.15), ("irregular", 0.15), ("new", 0.10)]
BEHAVIOUR = {  # (on time, late, missed)
    "reliable": (0.95, 0.04, 0.01), "steady_late": (0.68, 0.29, 0.03), "recovering": (0.93, 0.05, 0.02),
    "irregular": (0.50, 0.20, 0.30), "new": (0.94, 0.05, 0.01),
}
AGE_BANDS = [("18-24", 0.12), ("25-34", 0.28), ("35-44", 0.27), ("45-54", 0.19), ("55+", 0.14)]
GENDERS = [("Female", 0.58), ("Male", 0.40), ("Non-binary", 0.02)]


def pick(rng: random.Random, weighted):
    r, acc = rng.random(), 0.0
    for value, p in weighted:
        acc += p
        if r <= acc:
            return value
    return weighted[-1][0]


def months_back(d: date, n: int, day: int) -> date:
    y, m = d.year, d.month - n
    while m <= 0:
        y, m = y - 1, m + 12
    return date(y, m, min(day, 28))


def at(d: date, hour: int = 9, minute: int = 0) -> datetime:
    return datetime.combine(d, time(hour, minute), tzinfo=timezone.utc)


def seed(db, today: date | None = None, rng_seed: int = 2026) -> dict:
    rng = random.Random(rng_seed)
    now = datetime.now(timezone.utc)
    today = today or now.date()
    # Nothing in the seeded history is dated in the future.
    latest = min(now, at(today, 23, 0)) if today == now.date() else at(today, 23, 0)
    services.ensure_reference_data(db)
    unusable = hash_password(secrets.token_urlsafe(24))  # synthetic members never sign in
    demo_hash = hash_password(DEMO_PASSWORD)
    used_ids, used_names = set(), set()

    def member(email: str, name: str, password_hash: str, archetype: str | None) -> User:
        u = User(email=email, full_name=name, password_hash=password_hash, role="member", is_synthetic=True)
        db.add(u)
        db.flush()
        pid = new_passport_id()
        while pid in used_ids:
            pid = new_passport_id()
        used_ids.add(pid)
        db.add(MemberProfile(user_id=u.id, passport_id=pid))
        missing = rng.random() < 0.06
        db.add(MemberDemographics(user_id=u.id, age_band=None if missing else pick(rng, AGE_BANDS),
                                  gender=None if missing and rng.random() < 0.5 else pick(rng, GENDERS),
                                  synthetic_archetype=archetype))
        return u

    demo = {
        "member": member(*DEMO_ACCOUNTS["member"], demo_hash, "recovering"),
        "treasurer": member(*DEMO_ACCOUNTS["treasurer"], demo_hash, "reliable"),
        "administrator": member(*DEMO_ACCOUNTS["administrator"], demo_hash, "reliable"),
    }
    lender = User(email=DEMO_ACCOUNTS["lender"][0], full_name=DEMO_ACCOUNTS["lender"][1], password_hash=demo_hash,
                  role="lender", is_synthetic=True)
    admin = User(email=DEMO_ACCOUNTS["platform_admin"][0], full_name=DEMO_ACCOUNTS["platform_admin"][1],
                 password_hash=demo_hash, role="platform_admin", is_synthetic=True)
    db.add_all([lender, admin])
    db.flush()
    db.add(LenderAccount(user_id=lender.id, organisation_name="Example Community Lender (synthetic)", is_synthetic=True))
    used_names.update(n for _, n in DEMO_ACCOUNTS.values())

    pool: list[tuple[User, str]] = []
    n = 0

    def new_member() -> tuple[User, str]:
        nonlocal n
        n += 1
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        while name in used_names:
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        used_names.add(name)
        archetype = pick(rng, ARCHETYPES)
        return member(f"member{n:03d}@synthetic.stokvelpassport.example", name, unusable, archetype), archetype

    pending_records: list[tuple[datetime, Contribution, str, str]] = []  # (verified_at, contribution, method, action)
    stokvels = []
    for gi, (name, purpose, freq, amount, periods, size, due_day) in enumerate(GROUPS):
        owner, _ = new_member()
        s = Stokvel(name=name, purpose=purpose, frequency=freq, contribution_amount=Decimal(amount),
                    description=f"Synthetic {purpose} stokvel created for demonstration.",
                    join_code=f"DEMO{gi + 1}{secrets.token_hex(1).upper()}", created_by=owner.id, is_synthetic=True)
        db.add(s)
        db.flush()
        stokvels.append(s)
        if freq == "monthly":
            first_due = months_back(today, periods - (1 if today.day >= due_day else 0), due_day)
        else:
            last_friday = today - timedelta(days=(today.weekday() - 4) % 7)
            first_due = last_friday - timedelta(days=7 * (periods - 1))
        schedules = build_schedules(s, first_due, periods + (3 if freq == "monthly" else 6))
        db.add_all(schedules)
        db.flush()
        past = [x for x in schedules if x.due_date <= today]
        start = past[0].due_date

        roster: list[tuple[User, str, str, date]] = [(owner, "reliable", "owner", start)]
        if gi == 0:
            roster += [(demo["treasurer"], "reliable", "treasurer", start),
                       (demo["administrator"], "reliable", "administrator", start),
                       (demo["member"], "demo", "member", past[-13].due_date)]
        else:
            t, _ = new_member()
            roster.append((t, "reliable", "treasurer", start))
        while len(roster) < size:
            # About one member in eight belongs to a second stokvel.
            if gi > 0 and pool and rng.random() < 0.12:
                u, arch = rng.choice(pool)
                if any(u.id == r[0].id for r in roster):
                    continue
            else:
                u, arch = new_member()
                pool.append((u, arch))
            if arch == "new":
                joined = past[-rng.randint(3, 4)].due_date
            else:
                joined = past[rng.randint(0, max(0, len(past) // 3))].due_date if rng.random() < 0.35 else start
            roster.append((u, arch, "member", joined))

        window = 7 if freq == "weekly" else 30
        for u, arch, role, joined in roster:
            db.add(StokvelMembership(stokvel_id=s.id, user_id=u.id, role=role, status="active", joined_on=joined))
            mine = [x for x in past if x.due_date >= joined]
            gap = set()
            if arch == "recovering" and len(mine) > 6:
                g0 = rng.randint(2, len(mine) - 4)
                gap = {g0, g0 + 1} if rng.random() < 0.5 else {g0}
            for i, sch in enumerate(mine):
                age = (today - sch.due_date).days
                if arch == "demo":
                    outcome = "missed" if i == 4 else ("open" if i == len(mine) - 1 else "on_time")
                elif i in gap:
                    outcome = "missed"
                else:
                    p = BEHAVIOUR[arch]
                    r = rng.random()
                    outcome = "on_time" if r < p[0] else ("late" if r < p[0] + p[1] else "missed")
                if outcome in ("missed", "open"):
                    continue
                if age <= window and arch != "demo" and rng.random() < 0.25:
                    continue  # current period still unpaid for some members
                delay = rng.randint(-2, 2) if outcome == "on_time" else rng.randint(5, min(window - 1, 21))
                paid_day = min(sch.due_date + timedelta(days=delay), today)
                paid = min(at(paid_day, rng.randint(7, 19), rng.randint(0, 59)), latest - timedelta(minutes=rng.randint(5, 600)))
                via_provider = rng.random() < 0.6
                c = Contribution(
                    stokvel_id=s.id, member_id=u.id, schedule_id=sch.id, amount=sch.amount, currency="ZAR",
                    status="pending", verification_method="self_reported",
                    channel="payshap_request" if via_provider else "self_reported",
                    reference=f"{'TEST-PSR' if via_provider else 'SELF'}-{secrets.token_hex(6).upper()}",
                    idempotency_key=f"seed-{secrets.token_hex(10)}", paid_at=paid, created_at=paid, updated_at=paid)
                db.add(c)
                # A few recent self-reported records wait for the treasurer.
                if not via_provider and age <= window and gi == 0 and u.id != demo["treasurer"].id:
                    continue
                verified_at = paid if via_provider else min(paid + timedelta(hours=rng.randint(2, 40)), latest)
                pending_records.append((verified_at, c, "provider_confirmed" if via_provider else "manually_verified", "verify"))

    db.flush()

    # A reversed record and a record under review give the treasurer screens real cases.
    masakhane = stokvels[0]
    others = [c for _, c, _, _ in pending_records
              if c.stokvel_id == masakhane.id and c.member_id not in {u.id for u in demo.values()}]
    if len(others) > 12:
        victim = others[len(others) // 2]
        when = next(t for t, c, _, _ in pending_records if c is victim) + timedelta(days=2)
        pending_records.append((when, victim, "", "reverse"))

    treasurer = demo["treasurer"]
    for when, c, method, action in sorted(pending_records, key=lambda r: (r[0], str(r[1].id), r[3] == "reverse")):
        if action == "verify":
            if method == "provider_confirmed":
                db.add(PaymentRequest(contribution_id=c.id, provider="test", provider_reference=c.reference,
                                      amount=c.amount, currency="ZAR", status="succeeded", test_mode=True,
                                      created_at=c.paid_at, updated_at=when))
            services.verify_contribution(db, c, method=method, actor=None, when=when)
            if method == "manually_verified" and c.stokvel_id == masakhane.id:
                c.verified_by = treasurer.id
        else:
            services.reverse_contribution(db, c, None, "Duplicate bank transfer returned to member (synthetic example).", when=when)

    # Guarantee a visible review queue for the treasurer demo, whatever the calendar date.
    review_period = [x for x in masakhane.schedules if x.due_date <= today][-1]
    queue = db.execute(select(Contribution).where(
        Contribution.stokvel_id == masakhane.id, Contribution.status == "pending")).scalars().all()
    candidates = [m for m in masakhane.memberships
                  if m.role == "member" and m.user_id != demo["member"].id]
    for m in candidates:
        if len(queue) >= 4:
            break
        has = db.execute(select(Contribution).where(
            Contribution.member_id == m.user_id, Contribution.schedule_id == review_period.id,
            Contribution.status.in_(("pending", "verified", "under_review")))).scalars().first()
        if has:
            continue
        paid = min(at(min(review_period.due_date + timedelta(days=1), today), 10, 30), latest)
        c = Contribution(stokvel_id=masakhane.id, member_id=m.user_id, schedule_id=review_period.id,
                         amount=review_period.amount, currency="ZAR", status="pending",
                         verification_method="self_reported", channel="self_reported",
                         reference=f"SELF-{secrets.token_hex(6).upper()}", idempotency_key=f"seed-{secrets.token_hex(10)}",
                         paid_at=paid, created_at=paid, updated_at=paid)
        db.add(c)
        queue.append(c)
    if queue:
        queue[-1].status = "under_review"
        queue[-1].review_note = "Member report: I paid R500 but the reference on my slip is different (synthetic example)."

    # A join request for the administrator demo.
    applicant, _ = new_member()
    db.add(StokvelMembership(stokvel_id=masakhane.id, user_id=applicant.id, role="member", status="pending"))

    db.flush()
    ledger.create_checkpoint(db, admin.id)
    services.audit(db, admin, "seed.completed", None, None, {"synthetic": True})
    db.commit()
    return {
        "stokvels": len(stokvels),
        "members": db.query(User).filter(User.role == "member").count(),
        "contributions": db.query(Contribution).count(),
        "ledger_events": len(ledger.load_events(db)),
        "pending_reviews": len(queue),
    }


def main():
    parser = argparse.ArgumentParser(description="Seed synthetic demonstration data.")
    parser.add_argument("--reset", action="store_true", help="Drop every table first.")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.execute(select(User).limit(1)).first():
            print("Database already has data. Use --reset to rebuild.")
            return
        stats = seed(db)
    print("Synthetic data created:", stats)
    print("Demo password for every demo account:", DEMO_PASSWORD)
    for role, (email, name) in DEMO_ACCOUNTS.items():
        print(f"  {role:15s} {email}")


if __name__ == "__main__":
    main()
