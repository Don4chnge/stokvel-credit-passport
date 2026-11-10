from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ledger, services
from ..db import get_db
from ..deps import get_current_user, parse_uuid, require_admin
from ..fairness import run_fairness_report
from ..models import AuditLog, FairnessAuditRecord, LedgerCheckpoint, LedgerEvent, User
from ..schemas import TamperIn

router = APIRouter(tags=["ledger", "analytics"])


def _can_run_simulation(db: Session, user: User) -> None:
    if user.role == "platform_admin":
        return
    from ..deps import serialize_user

    if user.role != "member" or not serialize_user(db, user)["manages_stokvels"]:
        raise HTTPException(403, "Your role does not allow this action.")


@router.get("/ledger/verify")
def verify(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Recompute every hash in the chain. Open to every signed-in user."""
    result = ledger.verify_database_chain(db)
    services.audit(db, user, "ledger.verified", "ledger", None,
                   {"valid": result["valid"], "failures": len(result["failures"])})
    db.commit()
    return result


@router.get("/ledger/events")
def events(stokvel_id: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(LedgerEvent)
    if user.role == "platform_admin":
        if stokvel_id:
            q = q.where(LedgerEvent.stokvel_id == parse_uuid(stokvel_id))
    elif user.role == "member":
        if stokvel_id:
            m = services.require_membership(db, parse_uuid(stokvel_id), user)
            if m.role not in services.MANAGE_ROLES:
                raise HTTPException(403, "Your role does not allow this action.")
            q = q.where(LedgerEvent.stokvel_id == m.stokvel_id)
        else:
            q = q.where(LedgerEvent.member_id == user.id)  # members see their own events only
    else:
        raise HTTPException(403, "Your account type does not allow this action.")
    rows = db.execute(q.order_by(LedgerEvent.seq.desc()).limit(limit).offset(offset)).scalars().all()
    return [ledger.event_to_dict(e) for e in rows]


@router.get("/ledger/status")
def status(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = ledger.verify_database_chain(db)
    recent = db.execute(select(LedgerEvent).order_by(LedgerEvent.seq.desc()).limit(12)).scalars().all()
    failed = db.execute(select(AuditLog).where(AuditLog.action == "ledger.verified")
                        .order_by(AuditLog.created_at.desc()).limit(200)).scalars().all()
    cps = db.execute(select(LedgerCheckpoint).order_by(LedgerCheckpoint.created_at.desc()).limit(5)).scalars().all()
    return {
        **result,
        "failed_integrity_checks": sum(1 for a in failed if a.detail and not a.detail.get("valid", True)),
        "recent_events": [ledger.event_to_dict(e) for e in recent],
        "checkpoints": [{"seq": c.seq, "head_hash": c.head_hash, "created_at": c.created_at.isoformat()} for c in cps],
        "trust_note": ("A hash chain exposes edits made after the fact. Someone with full database control could "
                       "rewrite the whole chain, so head hashes should be published to an independent party."),
    }


@router.post("/ledger/checkpoints", status_code=201)
def checkpoint(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    cp = ledger.create_checkpoint(db, admin.id)
    if not cp:
        raise HTTPException(409, "The ledger is empty.")
    services.audit(db, admin, "ledger.checkpoint_created", "ledger_checkpoint", cp.id, {"seq": cp.seq})
    db.commit()
    return {"seq": cp.seq, "head_hash": cp.head_hash, "created_at": cp.created_at.isoformat()}


@router.post("/ledger/tamper-simulation")
def tamper(body: TamperIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Demonstrates detection on an in-memory copy. The stored ledger is never changed."""
    _can_run_simulation(db, user)
    result = ledger.tamper_simulation(ledger.load_events(db), body.target_seq, str(body.new_amount))
    if "error" in result:
        raise HTTPException(409, result["error"])
    services.audit(db, user, "ledger.tamper_simulation", "ledger", None, {"target_seq": result["target_seq"]})
    db.commit()
    return result


@router.get("/analytics/fairness")
def fairness(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Authorised fairness audit. The only code path that reads protected attributes."""
    results = run_fairness_report(db)
    rec = FairnessAuditRecord(model_version=results["model_version"], run_by=admin.id, results=results)
    db.add(rec)
    services.audit(db, admin, "fairness.report_run", "fairness_audit_record", rec.id)
    db.commit()
    return {"id": str(rec.id), "run_at": rec.run_at.isoformat(), **results}
