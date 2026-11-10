"""Business logic. Routers stay thin and call into here."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import ledger, scoring
from .models import (
    AuditLog, Contribution, ContributionSchedule, LedgerEvent, MemberProfile, MemberScoreSnapshot,
    PassportAccessLog, PassportConsent, PassportReport, PaymentProviderEvent, PaymentRequest,
    ScoreModel, Stokvel, StokvelMembership, StokvelRole, User, utcnow,
)
from .payments import ProviderEvent, get_provider
from .security import hash_token, new_passport_id, new_reference, new_share_token

MANAGE_ROLES = ("owner", "treasurer", "administrator")
SHARE_SCOPES = ("index", "explanation", "totals", "history", "memberships")

DEFAULT_ROLES = [
    dict(name="owner", description="Group owner. Full control of the group.",
         can_manage_members=True, can_verify_contributions=True, can_assign_roles=True),
    dict(name="treasurer", description="Verifies contributions and reconciles payments.",
         can_manage_members=False, can_verify_contributions=True, can_assign_roles=False),
    dict(name="administrator", description="Manages members and invitations.",
         can_manage_members=True, can_verify_contributions=False, can_assign_roles=False),
    dict(name="member", description="Contributes and owns a Passport.",
         can_manage_members=False, can_verify_contributions=False, can_assign_roles=False),
]


def ensure_reference_data(db: Session) -> None:
    for r in DEFAULT_ROLES:
        if not db.get(StokvelRole, r["name"]):
            db.add(StokvelRole(**r))
    if not db.execute(select(ScoreModel).where(ScoreModel.version == scoring.MODEL_VERSION)).scalar_one_or_none():
        db.add(ScoreModel(version=scoring.MODEL_VERSION, name="Contribution Reliability Index, rule-based",
                          config=scoring.DEFAULT_CONFIG, is_active=True))
    db.commit()


def audit(db: Session, actor: User | None, action: str, entity_type: str | None = None,
          entity_id=None, detail: dict | None = None, ip: str | None = None) -> None:
    db.add(AuditLog(actor_user_id=actor.id if actor else None, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id else None, detail=detail, ip=ip))


def money(v) -> str:
    return f"{Decimal(v or 0).quantize(Decimal('0.01'))}"


# ------------------------------------------------------------------ memberships
def get_membership(db: Session, stokvel_id, user_id) -> StokvelMembership | None:
    return db.execute(select(StokvelMembership).where(
        StokvelMembership.stokvel_id == stokvel_id, StokvelMembership.user_id == user_id)).scalar_one_or_none()


def require_membership(db: Session, stokvel_id, user: User, *, permission: str | None = None) -> StokvelMembership:
    """Server-side permission check for every stokvel-scoped action."""
    m = get_membership(db, stokvel_id, user.id)
    if not m or m.status != "active":
        raise HTTPException(403, "You are not an active member of this stokvel.")
    if permission:
        role = db.get(StokvelRole, m.role)
        if not role or not getattr(role, permission):
            raise HTTPException(403, "Your role does not allow this action.")
    return m


def ensure_profile(db: Session, user: User) -> MemberProfile:
    if user.profile:
        return user.profile
    for _ in range(5):
        pid = new_passport_id()
        if not db.execute(select(MemberProfile).where(MemberProfile.passport_id == pid)).scalar_one_or_none():
            break
    profile = MemberProfile(user_id=user.id, passport_id=pid)
    db.add(profile)
    db.flush()
    user.profile = profile
    return profile


# ------------------------------------------------------------------ contributions
def serialize_contribution(c: Contribution, *, include_member: bool = False) -> dict:
    out = {
        "id": str(c.id), "stokvel_id": str(c.stokvel_id), "stokvel_name": c.stokvel.name,
        "period_label": c.schedule.period_label, "due_date": c.schedule.due_date.isoformat(),
        "amount": money(c.amount), "currency": c.currency, "status": c.status,
        "verification_method": c.verification_method, "channel": c.channel, "reference": c.reference,
        "paid_at": c.paid_at.isoformat() if c.paid_at else None,
        "verified_at": c.verified_at.isoformat() if c.verified_at else None,
        "ledger_hash": c.ledger_hash, "review_note": c.review_note,
        "created_at": c.created_at.isoformat(),
    }
    if include_member:
        out["member_name"] = c.member.full_name
        out["member_id"] = str(c.member_id)
    return out


def create_contribution(db: Session, *, member: User, stokvel: Stokvel, schedule: ContributionSchedule,
                        channel: str, idempotency_key: str, reference: str | None = None,
                        paid_at: datetime | None = None) -> tuple[Contribution, bool]:
    """Create a contribution record. Returns (contribution, created). Idempotent on (member, key)."""
    existing = db.execute(select(Contribution).where(
        Contribution.member_id == member.id, Contribution.idempotency_key == idempotency_key)).scalar_one_or_none()
    if existing:
        return existing, False
    if schedule.stokvel_id != stokvel.id:
        raise HTTPException(422, "That contribution period does not belong to this stokvel.")
    duplicate = db.execute(select(Contribution).where(
        Contribution.member_id == member.id, Contribution.schedule_id == schedule.id,
        Contribution.status.in_(("pending", "verified", "under_review")))).scalars().first()
    if duplicate:
        raise HTTPException(409, "A contribution for this period already exists.")

    c = Contribution(
        stokvel_id=stokvel.id, member_id=member.id, schedule_id=schedule.id, amount=schedule.amount,
        currency=stokvel.currency, status="pending", verification_method="self_reported", channel=channel,
        reference=(reference or new_reference("SELF"))[:64], idempotency_key=idempotency_key,
        paid_at=paid_at or utcnow(),
    )
    db.add(c)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.execute(select(Contribution).where(
            Contribution.member_id == member.id, Contribution.idempotency_key == idempotency_key)).scalar_one()
        return existing, False

    if channel == "payshap_request":
        provider = get_provider()
        req = provider.create_request(amount=c.amount, currency=c.currency, reference=c.reference,
                                      idempotency_key=f"{member.id}:{idempotency_key}")
        c.reference = req.provider_reference
        db.add(PaymentRequest(contribution_id=c.id, provider=provider.name,
                              provider_reference=req.provider_reference, amount=c.amount, currency=c.currency,
                              status=req.status, test_mode=req.test_mode))
    audit(db, member, "contribution.created", "contribution", c.id, {"channel": channel})
    db.flush()
    return c, True


def verify_contribution(db: Session, c: Contribution, *, method: str, actor: User | None,
                        when: datetime | None = None) -> Contribution:
    """Mark verified and append to the ledger. method: manually_verified | provider_confirmed."""
    if c.status == "verified":
        return c
    if c.status not in ("pending", "under_review"):
        raise HTTPException(409, f"A {c.status} contribution cannot be verified.")
    if method not in ("manually_verified", "provider_confirmed"):
        raise HTTPException(422, "Unknown verification method.")
    when = when or utcnow()
    c.status, c.verification_method, c.verified_at = "verified", method, when
    c.verified_by = actor.id if actor else None
    ev = ledger.append_event(
        db, event_type=ledger.EVENT_VERIFIED, member_id=c.member_id, stokvel_id=c.stokvel_id,
        contribution_id=c.id, amount=c.amount, currency=c.currency, transaction_reference=c.reference,
        verification_status=method, timestamp=when)
    c.ledger_hash = ev.current_hash
    audit(db, actor, "contribution.verified", "contribution", c.id, {"method": method, "ledger_seq": ev.seq})
    db.flush()
    return c


def reject_contribution(db: Session, c: Contribution, actor: User, note: str | None) -> Contribution:
    if c.status not in ("pending", "under_review"):
        raise HTTPException(409, f"A {c.status} contribution cannot be rejected.")
    c.status, c.review_note = "rejected", note
    audit(db, actor, "contribution.rejected", "contribution", c.id, {"note": note})
    db.flush()
    return c


def reverse_contribution(db: Session, c: Contribution, actor: User | None, note: str | None,
                         when: datetime | None = None) -> Contribution:
    """A verified record is never edited. A reversal is a new linked ledger event."""
    if c.status != "verified":
        raise HTTPException(409, "Only a verified contribution can be reversed.")
    ev = ledger.append_event(
        db, event_type=ledger.EVENT_REVERSED, member_id=c.member_id, stokvel_id=c.stokvel_id,
        contribution_id=c.id, amount=c.amount, currency=c.currency, transaction_reference=c.reference,
        verification_status="reversed", timestamp=when or utcnow())
    c.status, c.review_note = "reversed", note
    audit(db, actor, "contribution.reversed", "contribution", c.id, {"note": note, "ledger_seq": ev.seq})
    db.flush()
    return c


def dispute_contribution(db: Session, c: Contribution, actor: User, note: str) -> Contribution:
    if c.status in ("rejected", "reversed"):
        raise HTTPException(409, f"A {c.status} contribution cannot be disputed.")
    if c.status == "verified":
        # The verified record and its ledger event stay untouched. The treasurer resolves with a reversal.
        c.review_note = f"Member report: {note}"
        audit(db, actor, "contribution.disputed", "contribution", c.id, {"note": note, "state": "verified"})
    else:
        c.status, c.review_note = "under_review", f"Member report: {note}"
        audit(db, actor, "contribution.disputed", "contribution", c.id, {"note": note})
    db.flush()
    return c


def handle_provider_event(db: Session, event: ProviderEvent) -> dict:
    """Apply a provider webhook exactly once."""
    if db.execute(select(PaymentProviderEvent).where(
            PaymentProviderEvent.provider_event_id == event.provider_event_id)).scalar_one_or_none():
        return {"status": "duplicate_ignored"}
    req = db.execute(select(PaymentRequest).where(
        PaymentRequest.provider_reference == event.provider_reference)).scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Unknown payment reference.")
    db.add(PaymentProviderEvent(payment_request_id=req.id, provider_event_id=event.provider_event_id,
                                event_type=event.event_type, payload=event.payload))
    c = req.contribution
    if event.event_type == "payment.succeeded":
        if req.status == "pending":
            req.status = "succeeded"
            c.paid_at = utcnow()
            verify_contribution(db, c, method="provider_confirmed", actor=None)
    elif event.event_type == "payment.failed":
        if req.status == "pending":
            req.status = "failed"
            c.status, c.review_note = "rejected", "Payment failed at the provider."
            audit(db, None, "payment.failed", "contribution", c.id)
    elif event.event_type == "payment.reversed":
        if req.status == "succeeded":
            req.status = "reversed"
            reverse_contribution(db, c, None, "Payment reversed by the provider.")
    else:
        raise HTTPException(422, "Unsupported provider event type.")
    db.flush()
    return {"status": "processed", "payment_status": req.status, "contribution_status": c.status}


# ------------------------------------------------------------------ scoring
def active_model(db: Session) -> ScoreModel:
    m = db.execute(select(ScoreModel).where(ScoreModel.is_active.is_(True))).scalars().first()
    if not m:
        ensure_reference_data(db)
        m = db.execute(select(ScoreModel).where(ScoreModel.is_active.is_(True))).scalars().first()
    return m


def build_obligations(db: Session, member_id, as_of: date, config: dict) -> list[scoring.Obligation]:
    """Turn memberships, schedules and contribution records into engine inputs.

    Only behavioural fields leave this function. No personal attribute of the member is read.
    """
    memberships = db.execute(select(StokvelMembership).where(
        StokvelMembership.user_id == member_id, StokvelMembership.status.in_(("active", "removed")),
        StokvelMembership.joined_on.is_not(None))).scalars().all()
    out: list[scoring.Obligation] = []
    for m in memberships:
        s = m.stokvel
        window = config["missed_after_days_weekly"] if s.frequency == "weekly" else config["missed_after_days"]
        schedules = db.execute(select(ContributionSchedule).where(
            ContributionSchedule.stokvel_id == s.id, ContributionSchedule.due_date >= m.joined_on,
            ContributionSchedule.due_date <= as_of).order_by(ContributionSchedule.due_date)).scalars().all()
        records = db.execute(select(Contribution).where(
            Contribution.member_id == member_id, Contribution.stokvel_id == s.id)).scalars().all()
        by_schedule: dict[uuid.UUID, list[Contribution]] = {}
        for c in records:
            by_schedule.setdefault(c.schedule_id, []).append(c)
        for sch in schedules:
            if m.left_on and sch.due_date > m.left_on:
                continue
            recs = by_schedule.get(sch.id, [])
            verified = next((c for c in recs if c.status == "verified"), None)
            if verified:
                state, paid = "paid", (verified.paid_at or verified.verified_at).date()
            elif any(c.status in ("pending", "under_review") for c in recs):
                state, paid = "unverified", None
            elif (as_of - sch.due_date).days > window:
                state, paid = "missed", None
            else:
                state, paid = "open", None
            out.append(scoring.Obligation(stokvel_key=str(s.id), frequency=s.frequency,
                                          due_date=sch.due_date, paid_date=paid, state=state))
    return out


def compute_score(db: Session, member_id, *, as_of: date | None = None, persist: bool = True) -> dict:
    as_of = as_of or utcnow().date()
    model = active_model(db)
    obligations = build_obligations(db, member_id, as_of, model.config)
    result = scoring.calculate(obligations, as_of, model.config, model.version)
    if persist:
        last = db.execute(select(MemberScoreSnapshot).where(MemberScoreSnapshot.member_id == member_id)
                          .order_by(MemberScoreSnapshot.computed_at.desc()).limit(1)).scalar_one_or_none()
        if last and last.inputs_digest == result["inputs_digest"] and last.model_version == model.version:
            result["snapshot_id"] = str(last.id)
            return result
        head = db.execute(select(LedgerEvent).order_by(LedgerEvent.seq.desc()).limit(1)).scalar_one_or_none()
        snap = MemberScoreSnapshot(
            member_id=member_id, model_version=model.version, score=result["score"],
            provisional=result["provisional"],
            factors={"factors": result["factors"], "counts": result["counts"]},
            explanation=result["explanation"], inputs_digest=result["inputs_digest"], as_of=as_of,
            ledger_head_hash=head.current_hash if head else None)
        db.add(snap)
        db.flush()
        result["snapshot_id"] = str(snap.id)
    return result


# ------------------------------------------------------------------ member views
def member_overview(db: Session, user: User) -> dict:
    score = compute_score(db, user.id)
    verified = db.execute(select(Contribution).where(
        Contribution.member_id == user.id, Contribution.status == "verified")).scalars().all()
    memberships = db.execute(select(StokvelMembership).where(
        StokvelMembership.user_id == user.id, StokvelMembership.status == "active")).scalars().all()
    commitment = Decimal("0")
    for m in memberships:
        amt = m.stokvel.contribution_amount
        commitment += (amt * 52 / 12) if m.stokvel.frequency == "weekly" else amt
    recent = db.execute(select(Contribution).where(Contribution.member_id == user.id)
                        .order_by(Contribution.created_at.desc()).limit(8)).scalars().all()
    counts = score["counts"]
    return {
        "score": score,
        "total_verified": money(sum((c.amount for c in verified), Decimal("0"))),
        "successful_payments": len(verified),
        "on_time_percentage": round(100 * counts["on_time"] / counts["due"], 1) if counts["due"] else None,
        "monthly_commitment": money(commitment),
        "participation_months": score["participation_months"],
        "active_memberships": len(memberships),
        "recent_activity": [serialize_contribution(c) for c in recent],
        "last_verified_at": max((c.verified_at for c in verified if c.verified_at), default=None),
    }


def monthly_series(db: Session, member_id, months: int = 12) -> list[dict]:
    rows = db.execute(select(Contribution).where(
        Contribution.member_id == member_id, Contribution.status == "verified")).scalars().all()
    today = utcnow().date()
    buckets: dict[str, Decimal] = {}
    y, m = today.year, today.month
    keys = []
    for _ in range(months):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    for k in keys:
        buckets[k] = Decimal("0")
    for c in rows:
        k = c.schedule.due_date.strftime("%Y-%m")
        if k in buckets:
            buckets[k] += c.amount
    return [{"month": k, "amount": float(buckets[k])} for k in reversed(keys)]


def generate_passport(db: Session, user: User) -> PassportReport:
    profile = ensure_profile(db, user)
    score = compute_score(db, user.id)
    verified = db.execute(select(Contribution).where(
        Contribution.member_id == user.id, Contribution.status == "verified")
        .order_by(Contribution.paid_at.desc())).scalars().all()
    memberships = db.execute(select(StokvelMembership).where(
        StokvelMembership.user_id == user.id, StokvelMembership.status.in_(("active", "removed")))).scalars().all()
    model = active_model(db)
    grace = model.config["grace_days"]
    head = db.execute(select(LedgerEvent).order_by(LedgerEvent.seq.desc()).limit(1)).scalar_one_or_none()
    last_verified = max((c.verified_at for c in verified if c.verified_at), default=None)
    counts = score["counts"]
    summary = {
        "member_name": user.full_name, "passport_id": profile.passport_id,
        "is_synthetic": user.is_synthetic,
        "index": {"score": score["score"], "provisional": score["provisional"],
                  "model_version": score["model_version"], "factors": score["factors"],
                  "timeline": score["timeline"]},
        "explanation": score["explanation"],
        "totals": {
            "total_verified": money(sum((c.amount for c in verified), Decimal("0"))),
            "verified_count": len(verified), "due": counts["due"], "on_time": counts["on_time"],
            "late": counts["late"], "missed": counts["missed"],
            "on_time_percentage": round(100 * counts["on_time"] / counts["due"], 1) if counts["due"] else None,
            "participation_months": score["participation_months"],
        },
        "history": [{
            "date": (c.paid_at or c.verified_at).date().isoformat(), "due_date": c.schedule.due_date.isoformat(),
            "amount": money(c.amount), "stokvel": c.stokvel.name, "reference": c.reference,
            "method": c.verification_method, "ledger_hash": c.ledger_hash,
            "on_time": ((c.paid_at or c.verified_at).date() - c.schedule.due_date).days <= grace,
        } for c in verified],
        "memberships": [{
            "stokvel": m.stokvel.name, "frequency": m.stokvel.frequency, "role": m.role, "status": m.status,
            "joined_on": m.joined_on.isoformat() if m.joined_on else None,
            "left_on": m.left_on.isoformat() if m.left_on else None,
        } for m in memberships],
        "provenance": {
            "ledger_head_hash": head.current_hash if head else None,
            "ledger_event_count": head.seq if head else 0,
            "inputs_digest": score["inputs_digest"],
            "source": "Verified contribution ledger, Stokvel Credit Passport",
        },
        "last_verified_at": last_verified.isoformat() if last_verified else None,
        "disclaimer": ("The Contribution Reliability Index is an experimental measure of contribution behaviour. "
                       "It is not a credit bureau score and it does not guarantee credit approval."),
    }
    report = PassportReport(member_id=user.id, snapshot_id=uuid.UUID(score["snapshot_id"]),
                            verification_code=new_reference("PV").replace("-", ""), summary=summary)
    db.add(report)
    audit(db, user, "passport.generated", "passport_report", report.id)
    db.flush()
    return report


def latest_passport(db: Session, user_id) -> PassportReport | None:
    return db.execute(select(PassportReport).where(PassportReport.member_id == user_id)
                      .order_by(PassportReport.generated_at.desc()).limit(1)).scalar_one_or_none()


def serialize_passport(report: PassportReport) -> dict:
    return {"id": str(report.id), "verification_code": report.verification_code,
            "generated_at": report.generated_at.isoformat(), **report.summary}


# ------------------------------------------------------------------ consent
def create_consent(db: Session, user: User, *, scopes: list[str], expires_in_days: int,
                   recipient_label: str) -> tuple[PassportConsent, str]:
    bad = [s for s in scopes if s not in SHARE_SCOPES]
    if bad or not scopes:
        raise HTTPException(422, f"Scopes must be chosen from: {', '.join(SHARE_SCOPES)}.")
    report = latest_passport(db, user.id) or generate_passport(db, user)
    token = new_share_token()
    consent = PassportConsent(
        member_id=user.id, report_id=report.id, recipient_label=recipient_label.strip()[:160],
        scopes=sorted(set(scopes)), token_hash=hash_token(token), token_hint=token[:6],
        expires_at=utcnow() + timedelta(days=expires_in_days))
    db.add(consent)
    audit(db, user, "passport.shared", "passport_consent", consent.id,
          {"scopes": consent.scopes, "expires_in_days": expires_in_days})
    db.flush()
    return consent, token


def consent_state(c: PassportConsent, now: datetime | None = None) -> str:
    now = now or utcnow()
    if c.revoked_at:
        return "revoked"
    if c.expires_at <= now:
        return "expired"
    return "active"


def resolve_shared_passport(db: Session, token: str, *, lender_account_id=None, ip: str | None = None) -> dict:
    """Return only the scopes the member authorised. Every attempt is logged."""
    consent = db.execute(select(PassportConsent).where(
        PassportConsent.token_hash == hash_token(token))).scalar_one_or_none()
    if not consent:
        raise HTTPException(404, "This Passport link is not valid.")
    state = consent_state(consent)
    log = PassportAccessLog(consent_id=consent.id, lender_account_id=lender_account_id,
                            outcome="granted" if state == "active" else state, ip=ip)
    db.add(log)
    db.flush()
    if state != "active":
        db.commit()
        raise HTTPException(410, f"Access to this Passport has {'been revoked by the member' if state == 'revoked' else 'expired'}.")
    report = db.get(PassportReport, consent.report_id)
    s = report.summary
    view = {
        "verification_id": str(log.id), "consent_expires_at": consent.expires_at.isoformat(),
        "scopes": consent.scopes, "member_name": s["member_name"], "passport_id": s["passport_id"],
        "is_synthetic": s.get("is_synthetic", False), "verification_code": report.verification_code,
        "generated_at": report.generated_at.isoformat(), "last_verified_at": s["last_verified_at"],
        "provenance": s["provenance"], "disclaimer": s["disclaimer"], "authentic": True,
    }
    for scope in consent.scopes:
        view[scope] = s[scope]
    if "index" in consent.scopes and "explanation" not in consent.scopes:
        view["index"] = {k: v for k, v in s["index"].items() if k not in ("factors", "timeline")}
    return view


def stokvel_overview(db: Session, s: Stokvel) -> dict:
    today = utcnow().date()
    members = [m for m in s.memberships if m.status == "active"]
    verified_total = db.execute(select(func.coalesce(func.sum(Contribution.amount), 0)).where(
        Contribution.stokvel_id == s.id, Contribution.status == "verified")).scalar_one()
    current = db.execute(select(ContributionSchedule).where(
        ContributionSchedule.stokvel_id == s.id, ContributionSchedule.due_date <= today)
        .order_by(ContributionSchedule.due_date.desc()).limit(1)).scalar_one_or_none()
    paid_current = 0
    eligible = len(members)
    if current:
        eligible = sum(1 for m in members if m.joined_on and m.joined_on <= current.due_date)
        paid_current = db.execute(select(func.count()).select_from(Contribution).where(
            Contribution.schedule_id == current.id, Contribution.status == "verified")).scalar_one()
    pending = db.execute(select(func.count()).select_from(Contribution).where(
        Contribution.stokvel_id == s.id, Contribution.status.in_(("pending", "under_review")))).scalar_one()
    target = s.contribution_amount * eligible
    return {
        "id": str(s.id), "name": s.name, "description": s.description, "purpose": s.purpose,
        "frequency": s.frequency, "contribution_amount": money(s.contribution_amount), "currency": s.currency,
        "join_code": s.join_code, "is_synthetic": s.is_synthetic, "member_count": len(members),
        "period_target": money(target), "total_verified": money(verified_total),
        "current_period": current.period_label if current else None,
        "current_due_date": current.due_date.isoformat() if current else None,
        "paid_current": paid_current, "eligible_current": eligible,
        "outstanding_current": money(s.contribution_amount * max(eligible - paid_current, 0)),
        "completion_rate": round(100 * paid_current / eligible, 1) if eligible else None,
        "pending_reviews": pending,
    }
