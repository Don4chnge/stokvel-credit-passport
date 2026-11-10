import secrets
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import services
from ..config import get_settings
from ..db import get_db
from ..deps import client_ip, get_current_user, parse_uuid, require_member
from ..models import (
    Contribution, ContributionSchedule, PaymentRequest, Stokvel, StokvelMembership, User, utcnow,
)
from ..payments import get_provider
from ..schemas import ContributionIn, DisputeIn, InviteIn, JoinIn, NoteIn, RoleIn, SimulateIn, StokvelIn

router = APIRouter(tags=["stokvels", "contributions"])


def next_month(d: date) -> date:
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(y, m, min(d.day, 28))


def build_schedules(stokvel: Stokvel, start: date, count: int) -> list[ContributionSchedule]:
    out, d = [], start
    for _ in range(count):
        label = d.strftime("%b %Y") if stokvel.frequency == "monthly" else f"{d.isocalendar().year}-W{d.isocalendar().week:02d}"
        out.append(ContributionSchedule(stokvel_id=stokvel.id, period_label=label, due_date=d,
                                        amount=stokvel.contribution_amount))
        d = next_month(d) if stokvel.frequency == "monthly" else d + timedelta(days=7)
    return out


def _stokvel(db: Session, stokvel_id: str) -> Stokvel:
    s = db.get(Stokvel, parse_uuid(stokvel_id))
    if not s:
        raise HTTPException(404, "Stokvel not found.")
    return s


# ------------------------------------------------------------------ stokvels
@router.get("/stokvels")
def my_stokvels(user: User = Depends(require_member), db: Session = Depends(get_db)):
    rows = db.execute(select(StokvelMembership).where(
        StokvelMembership.user_id == user.id, StokvelMembership.status != "removed")).scalars().all()
    return [{**services.stokvel_overview(db, m.stokvel), "my_role": m.role, "my_status": m.status,
             "membership_id": str(m.id)} for m in rows]


@router.post("/stokvels", status_code=201)
def create_stokvel(body: StokvelIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = Stokvel(name=body.name.strip(), description=body.description, purpose=body.purpose,
                frequency=body.frequency, contribution_amount=body.contribution_amount,
                join_code=secrets.token_hex(4).upper(), created_by=user.id)
    db.add(s)
    db.flush()
    today = utcnow().date()
    start = date(today.year, today.month, 25) if body.frequency == "monthly" else today + timedelta(days=(4 - today.weekday()) % 7)
    if start < today:
        start = next_month(start)
    db.add_all(build_schedules(s, start, 12 if body.frequency == "monthly" else 26))
    db.add(StokvelMembership(stokvel_id=s.id, user_id=user.id, role="owner", status="active", joined_on=today))
    services.audit(db, user, "stokvel.created", "stokvel", s.id)
    db.commit()
    return {**services.stokvel_overview(db, s), "my_role": "owner", "my_status": "active"}


@router.post("/stokvels/join", status_code=201)
def join(body: JoinIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = db.execute(select(Stokvel).where(Stokvel.join_code == body.join_code.strip().upper())).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "No stokvel matches that join code.")
    m = services.get_membership(db, s.id, user.id)
    if m and m.status in ("active", "pending"):
        raise HTTPException(409, "You already belong to this stokvel or your request is waiting.")
    if m:
        m.status = "active" if m.status == "invited" else "pending"
        if m.status == "active":
            m.joined_on, m.left_on = utcnow().date(), None
    else:
        m = StokvelMembership(stokvel_id=s.id, user_id=user.id, role="member", status="pending")
        db.add(m)
    services.audit(db, user, "membership.requested", "stokvel", s.id)
    db.commit()
    return {"stokvel_id": str(s.id), "stokvel_name": s.name, "status": m.status}


@router.get("/stokvels/{stokvel_id}")
def stokvel_detail(stokvel_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    m = services.require_membership(db, s.id, user)
    out = {**services.stokvel_overview(db, s), "my_role": m.role}
    if m.role not in services.MANAGE_ROLES:
        out.pop("join_code", None)
    return out


@router.get("/stokvels/{stokvel_id}/members")
def stokvel_members(stokvel_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    me = services.require_membership(db, s.id, user)
    manager = me.role in services.MANAGE_ROLES
    out = []
    for m in sorted(s.memberships, key=lambda x: x.user.full_name):
        if m.status == "removed" or (not manager and m.status != "active"):
            continue
        row = {"membership_id": str(m.id), "name": m.user.full_name, "role": m.role, "status": m.status,
               "joined_on": m.joined_on.isoformat() if m.joined_on else None}
        if manager:  # contribution detail is visible to managers only
            stats = db.execute(select(Contribution.status, func.count(), func.coalesce(func.sum(Contribution.amount), 0))
                               .where(Contribution.stokvel_id == s.id, Contribution.member_id == m.user_id)
                               .group_by(Contribution.status)).all()
            by = {st: (n, total) for st, n, total in stats}
            row.update({"user_id": str(m.user_id), "email": m.user.email,
                        "verified_count": by.get("verified", (0, 0))[0],
                        "verified_total": services.money(by.get("verified", (0, 0))[1]),
                        "pending_count": by.get("pending", (0, 0))[0] + by.get("under_review", (0, 0))[0]})
        out.append(row)
    return out


@router.post("/stokvels/{stokvel_id}/members/invite", status_code=201)
def invite(stokvel_id: str, body: InviteIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    services.require_membership(db, s.id, user, permission="can_manage_members")
    target = db.execute(select(User).where(User.email == body.email.lower(), User.role == "member")).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "No member account uses that email. Ask them to register first, then share the join code.")
    m = services.get_membership(db, s.id, target.id)
    if m and m.status in ("active", "invited"):
        raise HTTPException(409, "That person is already a member or already invited.")
    if m:
        m.status, m.role = ("active" if m.status == "pending" else "invited"), "member"
        if m.status == "active":
            m.joined_on, m.left_on = utcnow().date(), None
    else:
        m = StokvelMembership(stokvel_id=s.id, user_id=target.id, role="member", status="invited")
        db.add(m)
    services.audit(db, user, "membership.invited", "stokvel", s.id, {"target": str(target.id)})
    db.commit()
    return {"membership_id": str(m.id), "status": m.status}


@router.post("/stokvels/{stokvel_id}/accept")
def accept_invite(stokvel_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    m = services.get_membership(db, s.id, user.id)
    if not m or m.status != "invited":
        raise HTTPException(404, "No invitation found.")
    m.status, m.joined_on = "active", utcnow().date()
    services.audit(db, user, "membership.accepted", "stokvel", s.id)
    db.commit()
    return {"status": "active"}


def _target_membership(db: Session, s: Stokvel, membership_id: str) -> StokvelMembership:
    m = db.get(StokvelMembership, parse_uuid(membership_id))
    if not m or m.stokvel_id != s.id:
        raise HTTPException(404, "Membership not found.")
    return m


@router.post("/stokvels/{stokvel_id}/members/{membership_id}/approve")
def approve(stokvel_id: str, membership_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    services.require_membership(db, s.id, user, permission="can_manage_members")
    m = _target_membership(db, s, membership_id)
    if m.status != "pending":
        raise HTTPException(409, "Only a pending request can be approved.")
    m.status, m.joined_on = "active", utcnow().date()
    services.audit(db, user, "membership.approved", "stokvel_membership", m.id)
    db.commit()
    return {"membership_id": str(m.id), "status": m.status}


@router.delete("/stokvels/{stokvel_id}/members/{membership_id}")
def remove(stokvel_id: str, membership_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    services.require_membership(db, s.id, user, permission="can_manage_members")
    m = _target_membership(db, s, membership_id)
    if m.role == "owner":
        raise HTTPException(409, "The group owner cannot be removed.")
    m.status, m.left_on = "removed", utcnow().date()
    services.audit(db, user, "membership.removed", "stokvel_membership", m.id)
    db.commit()
    return {"membership_id": str(m.id), "status": m.status}


@router.patch("/stokvels/{stokvel_id}/members/{membership_id}/role")
def assign_role(stokvel_id: str, membership_id: str, body: RoleIn, user: User = Depends(require_member),
                db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    services.require_membership(db, s.id, user, permission="can_assign_roles")
    m = _target_membership(db, s, membership_id)
    if m.user_id == user.id:
        raise HTTPException(409, "You cannot change your own role.")
    if m.status != "active":
        raise HTTPException(409, "Only active members can hold a role.")
    m.role = body.role
    services.audit(db, user, "membership.role_assigned", "stokvel_membership", m.id, {"role": body.role})
    db.commit()
    return {"membership_id": str(m.id), "role": m.role}


@router.get("/stokvels/{stokvel_id}/contributions")
def stokvel_contributions(stokvel_id: str, status: str | None = None, member_id: str | None = None,
                          user: User = Depends(require_member), db: Session = Depends(get_db)):
    s = _stokvel(db, stokvel_id)
    me = services.require_membership(db, s.id, user)
    if me.role not in services.MANAGE_ROLES:
        raise HTTPException(403, "Your role does not allow this action.")
    q = select(Contribution).where(Contribution.stokvel_id == s.id)
    if status:
        q = q.where(Contribution.status.in_(status.split(",")))
    if member_id:
        q = q.where(Contribution.member_id == parse_uuid(member_id))
    rows = db.execute(q.order_by(Contribution.created_at.desc()).limit(300)).scalars().all()
    return [services.serialize_contribution(c, include_member=True) for c in rows]


@router.get("/stokvels/{stokvel_id}/calendar")
def calendar(stokvel_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    """Contribution calendar with reconciliation: who paid, who is late, who missed, per period."""
    s = _stokvel(db, stokvel_id)
    me = services.require_membership(db, s.id, user)
    if me.role not in services.MANAGE_ROLES:
        raise HTTPException(403, "Your role does not allow this action.")
    today = utcnow().date()
    cfg = services.active_model(db).config
    window = cfg["missed_after_days_weekly"] if s.frequency == "weekly" else cfg["missed_after_days"]
    members = [m for m in s.memberships if m.status == "active" and m.joined_on]
    schedules = db.execute(select(ContributionSchedule).where(ContributionSchedule.stokvel_id == s.id)
                           .order_by(ContributionSchedule.due_date.desc())).scalars().all()
    past = [x for x in schedules if x.due_date <= today][:12]
    upcoming = sorted([x for x in schedules if x.due_date > today], key=lambda x: x.due_date)[:2]
    out = []
    for sch in sorted(upcoming + past, key=lambda x: x.due_date, reverse=True):
        recs = db.execute(select(Contribution).where(Contribution.schedule_id == sch.id)).scalars().all()
        verified = {c.member_id: c for c in recs if c.status == "verified"}
        waiting = {c.member_id for c in recs if c.status in ("pending", "under_review")}
        eligible = [m for m in members if m.joined_on <= sch.due_date]
        late = sum(1 for c in verified.values() if c.paid_at and (c.paid_at.date() - sch.due_date).days > cfg["grace_days"])
        outstanding = [m.user.full_name for m in eligible if m.user_id not in verified and m.user_id not in waiting]
        closed = (today - sch.due_date).days > window
        out.append({
            "schedule_id": str(sch.id), "period_label": sch.period_label, "due_date": sch.due_date.isoformat(),
            "state": "upcoming" if sch.due_date > today else ("closed" if closed else "open"),
            "eligible": len(eligible), "verified": len(verified), "late": late, "awaiting_review": len(waiting),
            "missed": len(outstanding) if closed else 0, "outstanding": 0 if closed else len(outstanding),
            "outstanding_members": outstanding[:30],
            "collected": services.money(sum((c.amount for c in verified.values()), 0)),
            "expected": services.money(sch.amount * len(eligible)),
        })
    return out


# ------------------------------------------------------------------ contributions
def _contribution(db: Session, contribution_id: str) -> Contribution:
    c = db.get(Contribution, parse_uuid(contribution_id))
    if not c:
        raise HTTPException(404, "Contribution not found.")
    return c


@router.post("/contributions", status_code=201)
def create_contribution(body: ContributionIn, user: User = Depends(require_member), db: Session = Depends(get_db),
                        idempotency_key: str = Header(min_length=8, max_length=80)):
    s = _stokvel(db, body.stokvel_id)
    m = services.require_membership(db, s.id, user)
    sch = db.get(ContributionSchedule, parse_uuid(body.schedule_id))
    if not sch or sch.stokvel_id != s.id:
        raise HTTPException(404, "Contribution period not found.")
    if not m.joined_on or sch.due_date < m.joined_on:
        raise HTTPException(422, "That period is before you joined this stokvel.")
    c, created = services.create_contribution(db, member=user, stokvel=s, schedule=sch, channel=body.channel,
                                              idempotency_key=idempotency_key, reference=body.reference)
    db.commit()
    return {**services.serialize_contribution(c), "created": created,
            "test_mode": get_settings().payment_test_mode if c.channel == "payshap_request" else None}


@router.post("/contributions/{contribution_id}/verify")
def verify(contribution_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    c = _contribution(db, contribution_id)
    services.require_membership(db, c.stokvel_id, user, permission="can_verify_contributions")
    if c.member_id == user.id:
        raise HTTPException(403, "You cannot verify your own contribution. Another treasurer or the owner must review.")
    services.verify_contribution(db, c, method="manually_verified", actor=user)
    services.compute_score(db, c.member_id)
    db.commit()
    return services.serialize_contribution(c, include_member=True)


@router.post("/contributions/{contribution_id}/reject")
def reject(contribution_id: str, body: NoteIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    c = _contribution(db, contribution_id)
    services.require_membership(db, c.stokvel_id, user, permission="can_verify_contributions")
    services.reject_contribution(db, c, user, body.note)
    db.commit()
    return services.serialize_contribution(c, include_member=True)


@router.post("/contributions/{contribution_id}/reverse")
def reverse(contribution_id: str, body: NoteIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    c = _contribution(db, contribution_id)
    services.require_membership(db, c.stokvel_id, user, permission="can_verify_contributions")
    services.reverse_contribution(db, c, user, body.note)
    services.compute_score(db, c.member_id)
    db.commit()
    return services.serialize_contribution(c, include_member=True)


@router.post("/contributions/{contribution_id}/dispute")
def dispute(contribution_id: str, body: DisputeIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    c = _contribution(db, contribution_id)
    if c.member_id != user.id:
        raise HTTPException(404, "Contribution not found.")
    services.dispute_contribution(db, c, user, body.note)
    db.commit()
    return services.serialize_contribution(c)


@router.get("/contributions/{contribution_id}/receipt")
def receipt(contribution_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _contribution(db, contribution_id)
    if c.member_id != user.id:
        m = services.get_membership(db, c.stokvel_id, user.id)
        if not m or m.status != "active" or m.role not in services.MANAGE_ROLES:
            raise HTTPException(404, "Contribution not found.")
    req = db.execute(select(PaymentRequest).where(PaymentRequest.contribution_id == c.id)).scalar_one_or_none()
    return {**services.serialize_contribution(c, include_member=True),
            "payment": {"provider": req.provider, "provider_reference": req.provider_reference,
                        "status": req.status, "test_mode": req.test_mode} if req else None}


# ------------------------------------------------------------------ payments
@router.post("/payments/{contribution_id}/simulate")
async def simulate_payment(contribution_id: str, body: SimulateIn, user: User = Depends(require_member),
                           db: Session = Depends(get_db)):
    """TEST MODE only. Builds a signed provider event and sends it through the real webhook path."""
    if not get_settings().payment_test_mode:
        raise HTTPException(403, "Simulation is available in TEST MODE only.")
    c = _contribution(db, contribution_id)
    if c.member_id != user.id:
        raise HTTPException(404, "Contribution not found.")
    req = db.execute(select(PaymentRequest).where(PaymentRequest.contribution_id == c.id)).scalar_one_or_none()
    if not req:
        raise HTTPException(409, "This contribution has no payment request.")
    provider = get_provider("test")
    headers, raw = provider.build_event(req.provider_reference, body.outcome)
    result = services.handle_provider_event(db, provider.parse_event(headers, raw))
    services.compute_score(db, c.member_id)
    db.commit()
    return {**result, "contribution": services.serialize_contribution(c), "test_mode": True}


@router.post("/payments/webhook/{provider_name}")
async def webhook(provider_name: str, request: Request, db: Session = Depends(get_db)):
    try:
        provider = get_provider(provider_name)
        event = provider.parse_event({k.lower(): v for k, v in request.headers.items()}, await request.body())
    except (RuntimeError, ValueError, KeyError):
        services.audit(db, None, "payment.webhook_rejected", None, None, None, client_ip(request))
        db.commit()
        raise HTTPException(400, "Webhook rejected.")
    result = services.handle_provider_event(db, event)
    db.commit()
    return result
