import inspect
from dataclasses import fields
from datetime import date, timedelta

import pytest

from app import scoring
from app.scoring import Obligation, calculate

AS_OF = date(2026, 6, 30)


def monthly(states, start=date(2025, 7, 25), key="s1"):
    """states: 'o' on time, 'l' late, 'm' missed, 'u' unverified."""
    out, d = [], start
    for st in states:
        paid = {"o": d, "l": d + timedelta(days=10)}.get(st)
        state = {"o": "paid", "l": "paid", "m": "missed", "u": "unverified"}[st]
        out.append(Obligation(key, "monthly", d, paid, state))
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 25)
    return out


def test_perfect_long_history_scores_high():
    r = calculate(monthly("o" * 24, start=date(2024, 7, 25)), AS_OF)
    assert r["score"] >= 97
    assert r["counts"] == {"due": 24, "on_time": 24, "late": 0, "missed": 0, "unverified": 0, "verified_records": 24}


def test_score_is_within_bounds_and_weights_sum():
    for pattern in ("o" * 12, "m" * 12, "olmolmolmolm", "o"):
        r = calculate(monthly(pattern), AS_OF)
        assert 0 <= r["score"] <= 100
        assert abs(sum(f["weight"] for f in r["factors"].values()) - 1) < 1e-9
        assert r["score"] == round(sum(f["value"] * f["weight"] for f in r["factors"].values()))


def test_missed_contributions_lower_the_score():
    clean = calculate(monthly("o" * 12), AS_OF)["score"]
    one_miss = calculate(monthly("oooomooooooo"), AS_OF)["score"]
    many = calculate(monthly("omomomomomom"), AS_OF)["score"]
    assert clean > one_miss > many


def test_late_payment_counts_as_paid_but_not_on_time():
    r = calculate(monthly("ooooolooooooo"[:12]), AS_OF)
    assert r["counts"]["late"] == 1 and r["counts"]["missed"] == 0
    assert r["factors"]["on_time_rate"]["value"] == pytest.approx(100 * 11 / 12, abs=0.01)
    assert r["factors"]["missed_behaviour"]["value"] == 100


def test_grace_period_boundary():
    d = date(2026, 5, 25)
    on = calculate([Obligation("s", "monthly", d, d + timedelta(days=3), "paid")], AS_OF)
    late = calculate([Obligation("s", "monthly", d, d + timedelta(days=4), "paid")], AS_OF)
    assert on["counts"]["on_time"] == 1 and late["counts"]["late"] == 1


def test_recovery_after_a_miss_is_rewarded():
    recovered = calculate(monthly("ooomoooooooo"), AS_OF)
    not_recovered = calculate(monthly("ooomm"), AS_OF)
    assert recovered["factors"]["recovery"]["value"] == 100
    assert recovered["recovered_misses"] == 1
    assert not_recovered["factors"]["recovery"]["value"] == 0


def test_trailing_miss_gets_neutral_recovery_not_zero():
    r = calculate(monthly("ooooom"), AS_OF)
    assert r["factors"]["recovery"]["value"] == scoring.DEFAULT_CONFIG["neutral_recovery"]


def test_short_history_is_provisional():
    assert calculate(monthly("oo"), AS_OF)["provisional"] is True
    assert calculate(monthly("ooo"), AS_OF)["provisional"] is False


def test_no_history_gives_zero_and_clear_message():
    r = calculate([], AS_OF)
    assert r["score"] == 0 and r["provisional"]
    assert "no verified contribution history" in r["explanation"]["headline"].lower()


def test_unverified_records_reduce_completeness_only():
    r = calculate(monthly("ooooou"), AS_OF)
    assert r["counts"]["due"] == 5 and r["counts"]["unverified"] == 1
    assert r["factors"]["completeness"]["value"] == pytest.approx(100 * 5 / 6, abs=0.01)
    assert any("waiting for verification" in s for s in r["explanation"]["improvements"])


def test_future_obligations_are_ignored():
    obs = monthly("ooo") + [Obligation("s1", "monthly", date(2027, 1, 25), None, "open")]
    assert calculate(obs, AS_OF)["counts"]["due"] == 3


def test_calculation_is_reproducible_and_order_independent():
    obs = monthly("oolomoooomoo")
    a, b = calculate(obs, AS_OF), calculate(list(reversed(obs)), AS_OF)
    assert a["score"] == b["score"] and a["inputs_digest"] == b["inputs_digest"]
    assert a == calculate(obs, AS_OF)


def test_digest_changes_when_inputs_change():
    assert calculate(monthly("ooo"), AS_OF)["inputs_digest"] != calculate(monthly("oom"), AS_OF)["inputs_digest"]


def test_weights_are_configurable_and_validated():
    cfg = {**scoring.DEFAULT_CONFIG, "weights": {**scoring.DEFAULT_CONFIG["weights"], "on_time_rate": 0.5, "consistency": 0.05}}
    assert calculate(monthly("olololololol"), AS_OF, cfg)["score"] != calculate(monthly("olololololol"), AS_OF)["score"]
    bad = {**scoring.DEFAULT_CONFIG, "weights": {**scoring.DEFAULT_CONFIG["weights"], "on_time_rate": 0.9}}
    with pytest.raises(ValueError):
        calculate(monthly("ooo"), AS_OF, bad)


def test_explanation_matches_the_numbers():
    r = calculate(monthly("ooooomoooooo"), AS_OF)
    text = " ".join(r["explanation"]["strengths"])
    assert r["explanation"]["headline"] == f"Your reliability index is {r['score']} out of 100."
    assert "11 of 12 contributions paid on time." in text
    assert "11 verified contribution records." in text
    assert "6 consecutive contributions" in text
    assert "One missed contribution followed by a successful recovery." in text


def test_multiple_stokvels_are_combined():
    r = calculate(monthly("oooooo", key="a") + monthly("oooomo", key="b"), AS_OF)
    assert r["stokvel_count"] == 2 and r["counts"]["due"] == 12 and r["counts"]["missed"] == 1


# ---------------------------------------------------------------- fairness by construction
PROTECTED = ("age", "gender", "race", "religion", "sex", "ethnic", "disab", "marital", "national", "language", "name")


def test_engine_inputs_contain_no_protected_attributes():
    names = [f.name for f in fields(Obligation)]
    assert tuple(names) == scoring.ALLOWED_INPUT_FIELDS
    for n in names:
        assert not any(p in n.lower() for p in PROTECTED)


def test_engine_signature_accepts_no_member_identity():
    params = list(inspect.signature(calculate).parameters)
    assert params == ["obligations", "as_of", "config", "model_version"]


def test_config_has_no_protected_attributes():
    flat = str(scoring.DEFAULT_CONFIG).lower()
    for p in ("age", "gender", "race", "religion"):
        assert p not in flat.replace("grace", "").replace("average", "")
