import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text

from app import ledger
from app.models import LedgerEvent


def add(db, amount="500.00", event_type=ledger.EVENT_VERIFIED, ts=None):
    return ledger.append_event(db, event_type=event_type, member_id=uuid.uuid4(), stokvel_id=uuid.uuid4(),
                               contribution_id=uuid.uuid4(), amount=Decimal(amount), currency="ZAR",
                               transaction_reference="REF-1", verification_status="manually_verified",
                               timestamp=ts or datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc))


def chain(db, n=5):
    for i in range(n):
        add(db, f"{100 + i}.00")
    db.commit()
    return ledger.load_events(db)


def test_genesis_hash_is_defined_and_first_event_links_to_it(db):
    ev = add(db)
    assert ledger.GENESIS_HASH == hashlib.sha256(b"STOKVEL-CREDIT-PASSPORT/GENESIS/v1").hexdigest()
    assert ev.seq == 1 and ev.previous_hash == ledger.GENESIS_HASH


def test_hash_is_sha256_of_previous_hash_plus_canonical_data(db):
    ev = ledger.event_to_dict(add(db))
    canonical = json.dumps({k: (ev[k] if k == "seq" else str(ev[k])) for k in ledger.CANONICAL_FIELDS},
                           sort_keys=True, separators=(",", ":"))
    assert ev["current_hash"] == hashlib.sha256((ev["previous_hash"] + canonical).encode()).hexdigest()
    assert len(ev["current_hash"]) == 64


def test_events_link_in_sequence(db):
    events = chain(db)
    for prev, cur in zip(events, events[1:]):
        assert cur["previous_hash"] == prev["current_hash"] and cur["seq"] == prev["seq"] + 1


def test_valid_chain_verifies(db):
    result = ledger.verify_chain(chain(db, 8))
    assert result["valid"] and result["event_count"] == 8 and result["failures"] == []


def test_empty_chain_is_valid_with_genesis_head():
    r = ledger.verify_chain([])
    assert r["valid"] and r["head_hash"] == ledger.GENESIS_HASH


def test_timestamps_are_canonical_utc():
    from datetime import timedelta
    sast = timezone(timedelta(hours=2))
    assert ledger.canonical_timestamp(datetime(2026, 3, 1, 11, 0, tzinfo=sast)) == "2026-03-01T09:00:00.000000Z"
    assert ledger.canonical_amount("500") == "500.00"


def test_altered_amount_is_detected(db):
    events = chain(db)
    events[2]["amount"] = "9999.00"
    r = ledger.verify_chain(events)
    assert not r["valid"] and r["failures"][0]["seq"] == 3 and r["failures"][0]["code"] == "HASH_MISMATCH"


def test_altered_and_rehashed_event_still_breaks_the_next_link(db):
    events = chain(db)
    events[2]["amount"] = "9999.00"
    events[2]["current_hash"] = ledger.compute_hash(events[2]["previous_hash"], events[2])
    r = ledger.verify_chain(events)
    assert not r["valid"] and {"seq": 4, "code": "BROKEN_LINK"}.items() <= r["failures"][0].items()


def test_every_field_is_protected(db):
    base = chain(db, 3)
    for field in ledger.CANONICAL_FIELDS:
        events = copy.deepcopy(base)
        events[1][field] = 99 if field == "seq" else "tampered"
        assert not ledger.verify_chain(events)["valid"], field


def test_missing_event_is_detected(db):
    events = chain(db)
    del events[2]
    codes = {f["code"] for f in ledger.verify_chain(events)["failures"]}
    assert "SEQUENCE_GAP" in codes and "BROKEN_LINK" in codes


def test_reordered_events_are_detected(db):
    events = chain(db)
    events[1], events[2] = events[2], events[1]
    assert not ledger.verify_chain(events)["valid"]


def test_removed_tail_is_caught_by_checkpoint(db):
    events = chain(db, 5)
    cp = [{"seq": 5, "head_hash": events[-1]["current_hash"]}]
    assert ledger.verify_chain(events, cp)["valid"]
    r = ledger.verify_chain(events[:3], cp)
    assert not r["valid"] and r["failures"][0]["code"] == "CHECKPOINT_MISMATCH"


def test_full_rewrite_is_caught_only_by_checkpoint(db):
    """Documents the trust assumption: a rewritten chain is self-consistent. The checkpoint catches it."""
    events = chain(db, 4)
    cp = [{"seq": 4, "head_hash": events[-1]["current_hash"]}]
    forged, prev = copy.deepcopy(events), ledger.GENESIS_HASH
    forged[1]["amount"] = "1.00"
    for e in forged:
        e["previous_hash"] = prev
        e["current_hash"] = prev = ledger.compute_hash(prev, e)
    assert ledger.verify_chain(forged)["valid"]
    assert not ledger.verify_chain(forged, cp)["valid"]


def test_database_tampering_is_detected(db):
    chain(db, 6)
    assert ledger.verify_database_chain(db)["valid"]
    db.execute(text("UPDATE ledger_events SET amount = '77777.00' WHERE seq = 3"))
    db.commit()
    r = ledger.verify_database_chain(db)
    assert not r["valid"] and r["failures"][0]["seq"] == 3


def test_database_deletion_is_detected(db):
    chain(db, 6)
    db.execute(text("DELETE FROM ledger_events WHERE seq = 4"))
    db.commit()
    assert not ledger.verify_database_chain(db)["valid"]


def test_tamper_simulation_does_not_touch_the_database(db):
    events = chain(db, 7)
    sim = ledger.tamper_simulation(events, target_seq=3, new_amount="5000.00")
    assert sim["before"]["valid"] and not sim["after_edit"]["valid"] and not sim["after_edit_and_rehash"]["valid"]
    assert sim["original_amount"] == "102.00" and sim["tampered_amount"] == "5000.00"
    assert ledger.verify_database_chain(db)["valid"]
    assert db.get(LedgerEvent, 3).amount == "102.00"
