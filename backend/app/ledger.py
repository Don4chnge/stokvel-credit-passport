"""Tamper-evident contribution ledger.

current_hash = SHA256(previous_hash + canonical_event_data)

Trust assumptions (see docs/ARCHITECTURE.md): a hash chain proves that history was not
edited after the fact by anyone who cannot rewrite the whole chain. A privileged database
administrator could rewrite events and hashes together, so head hashes are checkpointed and
should be published to an independent party at regular intervals.
"""
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import LedgerCheckpoint, LedgerEvent

GENESIS_HASH = hashlib.sha256(b"STOKVEL-CREDIT-PASSPORT/GENESIS/v1").hexdigest()

EVENT_VERIFIED = "CONTRIBUTION_VERIFIED"
EVENT_REVERSED = "CONTRIBUTION_REVERSED"
EVENT_CORRECTED = "CONTRIBUTION_CORRECTED"

CANONICAL_FIELDS = (
    "seq", "event_id", "event_type", "member_id", "stokvel_id", "contribution_id",
    "amount", "currency", "transaction_reference", "timestamp", "verification_status",
)


def canonical_amount(amount: Decimal | str) -> str:
    return f"{Decimal(str(amount)).quantize(Decimal('0.01'))}"


def canonical_timestamp(ts: datetime) -> str:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def canonical_event_data(event: dict) -> str:
    """Deterministic JSON: fixed field set, sorted keys, no whitespace."""
    payload = {k: str(event[k]) if k != "seq" else int(event[k]) for k in CANONICAL_FIELDS}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_hash(previous_hash: str, event: dict) -> str:
    return hashlib.sha256((previous_hash + canonical_event_data(event)).encode("utf-8")).hexdigest()


def event_to_dict(e: LedgerEvent) -> dict:
    return {
        "seq": e.seq, "event_id": str(e.event_id), "event_type": e.event_type,
        "member_id": str(e.member_id), "stokvel_id": str(e.stokvel_id),
        "contribution_id": str(e.contribution_id), "amount": e.amount, "currency": e.currency,
        "transaction_reference": e.transaction_reference, "timestamp": e.timestamp,
        "verification_status": e.verification_status,
        "previous_hash": e.previous_hash, "current_hash": e.current_hash,
    }


@dataclass
class ChainFailure:
    seq: int | None
    code: str  # HASH_MISMATCH | BROKEN_LINK | SEQUENCE_GAP | BAD_GENESIS | CHECKPOINT_MISMATCH
    message: str


def verify_chain(events: list[dict], checkpoints: list[dict] | None = None) -> dict:
    """Pure verification over ordered event dicts. Detects edits, removals and reordering."""
    failures: list[ChainFailure] = []
    previous = GENESIS_HASH
    expected_seq = 1
    by_seq = {}
    for ev in events:
        seq = ev["seq"]
        by_seq[seq] = ev
        if seq != expected_seq:
            failures.append(ChainFailure(seq, "SEQUENCE_GAP",
                                         f"Expected event {expected_seq} but found {seq}. An event is missing or out of order."))
            expected_seq = seq
        if ev["previous_hash"] != previous:
            code = "BAD_GENESIS" if seq == 1 else "BROKEN_LINK"
            failures.append(ChainFailure(seq, code, f"Event {seq} does not link to the hash of the event before it."))
        recomputed = compute_hash(ev["previous_hash"], ev)
        if recomputed != ev["current_hash"]:
            failures.append(ChainFailure(seq, "HASH_MISMATCH",
                                         f"Event {seq} content does not match its stored hash. The record was altered."))
        previous = ev["current_hash"]
        expected_seq += 1
    for cp in checkpoints or []:
        ev = by_seq.get(cp["seq"])
        if ev is None or ev["current_hash"] != cp["head_hash"]:
            failures.append(ChainFailure(cp["seq"], "CHECKPOINT_MISMATCH",
                                         f"Checkpoint at event {cp['seq']} no longer matches the chain."))
    return {
        "valid": not failures,
        "event_count": len(events),
        "head_hash": events[-1]["current_hash"] if events else GENESIS_HASH,
        "genesis_hash": GENESIS_HASH,
        "failures": [f.__dict__ for f in failures],
        "checked_at": canonical_timestamp(datetime.now(timezone.utc)),
    }


# ------------------------------------------------------------------ database operations
def head(db: Session) -> LedgerEvent | None:
    return db.execute(select(LedgerEvent).order_by(LedgerEvent.seq.desc()).limit(1).with_for_update()).scalar_one_or_none()


def append_event(db: Session, *, event_type: str, member_id, stokvel_id, contribution_id,
                 amount, currency: str, transaction_reference: str, verification_status: str,
                 timestamp: datetime | None = None) -> LedgerEvent:
    """Append one event. The only write path into the ledger."""
    last = head(db)
    previous_hash = last.current_hash if last else GENESIS_HASH
    data = {
        "seq": (last.seq + 1) if last else 1,
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "member_id": str(member_id), "stokvel_id": str(stokvel_id), "contribution_id": str(contribution_id),
        "amount": canonical_amount(amount), "currency": currency,
        "transaction_reference": transaction_reference,
        "timestamp": canonical_timestamp(timestamp or datetime.now(timezone.utc)),
        "verification_status": verification_status,
    }
    ev = LedgerEvent(
        seq=data["seq"], event_id=uuid.UUID(data["event_id"]), event_type=event_type,
        member_id=uuid.UUID(data["member_id"]), stokvel_id=uuid.UUID(data["stokvel_id"]),
        contribution_id=uuid.UUID(data["contribution_id"]), amount=data["amount"], currency=currency,
        transaction_reference=transaction_reference, timestamp=data["timestamp"],
        verification_status=verification_status, previous_hash=previous_hash,
        current_hash=compute_hash(previous_hash, data),
    )
    db.add(ev)
    db.flush()
    return ev


def load_events(db: Session) -> list[dict]:
    return [event_to_dict(e) for e in db.execute(select(LedgerEvent).order_by(LedgerEvent.seq)).scalars()]


def verify_database_chain(db: Session) -> dict:
    cps = [{"seq": c.seq, "head_hash": c.head_hash} for c in db.execute(select(LedgerCheckpoint)).scalars()]
    result = verify_chain(load_events(db), cps)
    result["checkpoint_count"] = len(cps)
    return result


def create_checkpoint(db: Session, user_id=None) -> LedgerCheckpoint | None:
    last = db.execute(select(LedgerEvent).order_by(LedgerEvent.seq.desc()).limit(1)).scalar_one_or_none()
    if not last:
        return None
    cp = LedgerCheckpoint(seq=last.seq, head_hash=last.current_hash, created_by=user_id)
    db.add(cp)
    db.flush()
    return cp


def tamper_simulation(events: list[dict], target_seq: int | None = None, new_amount: str = "5000.00") -> dict:
    """Run a tampering demo on an in-memory copy. The stored ledger is never touched."""
    if not events:
        return {"error": "The ledger is empty."}
    before = verify_chain(events)
    copy = [dict(e) for e in events]
    target_seq = target_seq or copy[len(copy) // 2]["seq"]
    target = next((e for e in copy if e["seq"] == target_seq), None)
    if target is None:
        return {"error": f"No ledger event with sequence {target_seq}."}
    original_amount = target["amount"]
    target["amount"] = canonical_amount(new_amount)
    naive = verify_chain(copy)
    # A more careful attacker also recomputes the hash of the edited event. The next link still breaks.
    target["current_hash"] = compute_hash(target["previous_hash"], target)
    rehashed = verify_chain(copy)
    return {
        "simulation": True,
        "note": "Simulation on an in-memory copy. The stored ledger was not changed.",
        "target_seq": target_seq, "original_amount": original_amount, "tampered_amount": target["amount"],
        "before": before, "after_edit": naive, "after_edit_and_rehash": rehashed,
    }
