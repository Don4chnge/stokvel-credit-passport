from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import services
from ..db import get_db
from ..deps import client_ip, get_current_user, parse_uuid, require_admin, require_lender, require_member, serialize_user
from ..models import (
    AuditLog, Contribution, ContributionSchedule, LenderAccount, PassportAccessLog, PassportConsent,
    PassportReport, StokvelMembership, User, utcnow,
)
from ..pdf import passport_pdf
from ..schemas import ConsentIn, ShareIn

router = APIRouter(tags=["members", "passport"])


@router.get("/members/me")
def me(user: User = Depends(require_member), db: Session = Depends(get_db)):
    services.ensure_profile(db, user)
    overview = services.member_overview(db, user)
    db.commit()
    return {"user": serialize_user(db, user), **overview, "series": services.monthly_series(db, user.id)}


@router.get("/members/me/contributions")
def my_contributions(user: User = Depends(require_member), db: Session = Depends(get_db)):
    rows = db.execute(select(Contribution).where(Contribution.member_id == user.id)
                      .order_by(Contribution.created_at.desc())).scalars().all()
    rows.sort(key=lambda c: c.schedule.due_date, reverse=True)
    return [services.serialize_contribution(c) for c in rows]


@router.get("/members/me/memberships")
def my_memberships(user: User = Depends(require_member), db: Session = Depends(get_db)):
    """Memberships with the periods the member is able to pay now."""
    today = utcnow().date()
    out = []
    for m in db.execute(select(StokvelMembership).where(StokvelMembership.user_id == user.id)).scalars():
        s = m.stokvel
        item = {"membership_id": str(m.id), "stokvel_id": str(s.id), "stokvel_name": s.name, "role": m.role,
                "status": m.status, "frequency": s.frequency,
                "contribution_amount": services.money(s.contribution_amount),
                "joined_on": m.joined_on.isoformat() if m.joined_on else None, "payable": []}
        if m.status == "active" and m.joined_on:
            schedules = db.execute(select(ContributionSchedule).where(
                ContributionSchedule.stokvel_id == s.id, ContributionSchedule.due_date >= m.joined_on)
                .order_by(ContributionSchedule.due_date)).scalars().all()
            taken = set(db.execute(select(Contribution.schedule_id).where(
                Contribution.member_id == user.id, Contribution.stokvel_id == s.id,
                Contribution.status.in_(("pending", "verified", "under_review")))).scalars())
            upcoming = 0
            for sch in schedules:
                if sch.id in taken:
                    continue
                if sch.due_date > today:
                    upcoming += 1
                    if upcoming > 1:
                        break
                item["payable"].append({"schedule_id": str(sch.id), "period_label": sch.period_label,
                                        "due_date": sch.due_date.isoformat(), "amount": services.money(sch.amount),
                                        "overdue": sch.due_date < today})
            item["payable"] = item["payable"][-4:]
        out.append(item)
    return out


@router.patch("/members/me/analytics-consent")
def analytics_consent(body: ConsentIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    profile = services.ensure_profile(db, user)
    profile.analytics_consent = body.analytics_consent
    services.audit(db, user, "analytics.consent_changed", "user", user.id, {"granted": body.analytics_consent})
    db.commit()
    return {"analytics_consent": profile.analytics_consent}


@router.get("/members/me/export")
def export_my_data(user: User = Depends(require_member), db: Session = Depends(get_db)):
    """Data access request: everything the platform holds about the member, as JSON."""
    contributions = db.execute(select(Contribution).where(Contribution.member_id == user.id)).scalars().all()
    consents = db.execute(select(PassportConsent).where(PassportConsent.member_id == user.id)).scalars().all()
    passport = services.latest_passport(db, user.id)
    services.audit(db, user, "member.data_exported", "user", user.id)
    db.commit()
    return {
        "exported_at": utcnow().isoformat(), "account": serialize_user(db, user),
        "contributions": [services.serialize_contribution(c) for c in contributions],
        "passport": services.serialize_passport(passport) if passport else None,
        "sharing": [{"id": str(c.id), "recipient": c.recipient_label, "scopes": c.scopes,
                     "created_at": c.created_at.isoformat(), "expires_at": c.expires_at.isoformat(),
                     "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None} for c in consents],
    }


@router.post("/members/me/deletion-request", status_code=202)
def request_deletion(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Open to members and lenders. Platform staff handle the request within 30 days."""
    if not user.deletion_requested_at:
        user.deletion_requested_at = utcnow()
        services.audit(db, user, "member.deletion_requested", "user", user.id)
        db.commit()
    return {"status": "received", "requested_at": user.deletion_requested_at.isoformat(),
            "detail": "Your request is recorded. Ledger entries are retained in pseudonymised form. See the data retention policy."}


@router.delete("/members/me/deletion-request")
def cancel_deletion(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.deletion_requested_at:
        user.deletion_requested_at = None
        services.audit(db, user, "member.deletion_cancelled", "user", user.id)
        db.commit()
    return {"status": "cancelled"}


@router.get("/admin/deletion-requests")
def deletion_requests(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(User).where(User.deletion_requested_at.is_not(None))
                      .order_by(User.deletion_requested_at)).scalars().all()
    return [{"user_id": str(u.id), "role": u.role, "requested_at": u.deletion_requested_at.isoformat(),
             "is_synthetic": u.is_synthetic} for u in rows]


# ------------------------------------------------------------------ passport
@router.get("/members/me/passport")
def get_passport(user: User = Depends(require_member), db: Session = Depends(get_db)):
    report = services.latest_passport(db, user.id)
    if not report:
        raise HTTPException(404, "No Passport yet. Generate your first Passport.")
    return services.serialize_passport(report)


@router.post("/members/me/passport", status_code=201)
def generate_passport(user: User = Depends(require_member), db: Session = Depends(get_db)):
    report = services.generate_passport(db, user)
    db.commit()
    return services.serialize_passport(report)


@router.get("/members/me/passport/pdf")
def passport_pdf_download(user: User = Depends(require_member), db: Session = Depends(get_db)):
    report = services.latest_passport(db, user.id)
    if not report:
        raise HTTPException(404, "No Passport yet. Generate your first Passport.")
    services.audit(db, user, "passport.downloaded", "passport_report", report.id)
    db.commit()
    data = passport_pdf(services.serialize_passport(report))
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{report.summary["passport_id"]}.pdf"'})


@router.post("/passport/share", status_code=201)
def share(body: ShareIn, user: User = Depends(require_member), db: Session = Depends(get_db)):
    consent, token = services.create_consent(db, user, scopes=body.scopes, expires_in_days=body.expires_in_days,
                                             recipient_label=body.recipient_label)
    db.commit()
    return {"id": str(consent.id), "token": token, "scopes": consent.scopes,
            "expires_at": consent.expires_at.isoformat(), "recipient_label": consent.recipient_label,
            "notice": "This link is shown once. Store it or send it to your lender now."}


@router.get("/passport/shares")
def list_shares(user: User = Depends(require_member), db: Session = Depends(get_db)):
    out = []
    consents = db.execute(select(PassportConsent).where(PassportConsent.member_id == user.id)
                          .order_by(PassportConsent.created_at.desc())).scalars().all()
    for c in consents:
        logs = db.execute(select(PassportAccessLog, LenderAccount).outerjoin(
            LenderAccount, LenderAccount.id == PassportAccessLog.lender_account_id).where(
            PassportAccessLog.consent_id == c.id).order_by(PassportAccessLog.accessed_at.desc())).all()
        out.append({
            "id": str(c.id), "recipient_label": c.recipient_label, "scopes": c.scopes,
            "token_hint": c.token_hint + "…", "state": services.consent_state(c),
            "created_at": c.created_at.isoformat(), "expires_at": c.expires_at.isoformat(),
            "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
            "access_log": [{"accessed_at": log.accessed_at.isoformat(), "outcome": log.outcome,
                            "organisation": la.organisation_name if la else "Unknown"} for log, la in logs],
        })
    return out


@router.delete("/passport/share/{consent_id}")
def revoke(consent_id: str, user: User = Depends(require_member), db: Session = Depends(get_db)):
    c = db.get(PassportConsent, parse_uuid(consent_id))
    if not c or c.member_id != user.id:
        raise HTTPException(404, "Not found.")
    if not c.revoked_at:
        c.revoked_at = utcnow()
        services.audit(db, user, "passport.revoked", "passport_consent", c.id)
        db.commit()
    return {"id": str(c.id), "state": "revoked"}


@router.get("/passport/verify/{code}")
def public_verify(code: str, db: Session = Depends(get_db)):
    """Public authenticity check behind the QR code. Returns no personal financial detail."""
    report = db.execute(select(PassportReport).where(PassportReport.verification_code == code[:32])).scalar_one_or_none()
    if not report:
        return {"authentic": False, "detail": "No Passport report matches this code."}
    latest = services.latest_passport(db, report.member_id)
    name = report.summary["member_name"].split()
    return {
        "authentic": True, "passport_id": report.summary["passport_id"],
        "holder_initials": "".join(p[0].upper() + "." for p in name[:3]),
        "generated_at": report.generated_at.isoformat(), "is_latest": latest.id == report.id,
        "is_synthetic": report.summary.get("is_synthetic", False),
        "detail": "This code matches a Passport report issued by the platform. Ask the holder to share access for details.",
    }


# ------------------------------------------------------------------ lender access
@router.get("/passport/shared/{token}")
def shared_passport(token: str, request: Request, lender: User = Depends(require_lender),
                    db: Session = Depends(get_db)):
    view = services.resolve_shared_passport(db, token, lender_account_id=lender.lender_account.id,
                                            ip=client_ip(request))
    services.audit(db, lender, "passport.accessed", "passport_access_log", view["verification_id"],
                   None, client_ip(request))
    db.commit()
    return view


@router.get("/passport/shared/{token}/pdf")
def shared_passport_pdf(token: str, request: Request, lender: User = Depends(require_lender),
                        db: Session = Depends(get_db)):
    view = services.resolve_shared_passport(db, token, lender_account_id=lender.lender_account.id,
                                            ip=client_ip(request))
    services.audit(db, lender, "passport.report_downloaded", "passport_access_log", view["verification_id"])
    db.commit()
    return Response(passport_pdf(view, shared=True), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{view["passport_id"]}-shared.pdf"'})


@router.get("/lender/verifications")
def lender_verifications(lender: User = Depends(require_lender), db: Session = Depends(get_db)):
    rows = db.execute(select(PassportAccessLog, PassportConsent).join(
        PassportConsent, PassportConsent.id == PassportAccessLog.consent_id).where(
        PassportAccessLog.lender_account_id == lender.lender_account.id)
        .order_by(PassportAccessLog.accessed_at.desc()).limit(50)).all()
    return [{"id": str(log.id), "accessed_at": log.accessed_at.isoformat(), "outcome": log.outcome,
             "consent_state": services.consent_state(c), "scopes": c.scopes} for log, c in rows]


@router.get("/lender/verifications/{verification_id}")
def lender_verification(verification_id: str, lender: User = Depends(require_lender),
                        db: Session = Depends(get_db)):
    log = db.get(PassportAccessLog, parse_uuid(verification_id))
    if not log or log.lender_account_id != lender.lender_account.id:
        raise HTTPException(404, "Not found.")
    c = db.get(PassportConsent, log.consent_id)
    state = services.consent_state(c)
    out = {"id": str(log.id), "accessed_at": log.accessed_at.isoformat(), "outcome": log.outcome,
           "consent_state": state, "scopes": c.scopes, "consent_expires_at": c.expires_at.isoformat()}
    if state == "active" and log.outcome == "granted":
        report = db.get(PassportReport, c.report_id)
        out["passport_id"] = report.summary["passport_id"]
        out["verification_code"] = report.verification_code
    return out


@router.get("/admin/audit-logs")
def audit_logs(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)).scalars().all()
    return [{"id": str(a.id), "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id,
             "actor_user_id": str(a.actor_user_id) if a.actor_user_id else None,
             "created_at": a.created_at.isoformat()} for a in rows]
