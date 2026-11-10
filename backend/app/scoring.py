"""Contribution Reliability Index (CRI).

A deterministic, rule-based, versioned scoring engine. Pure functions only: no database,
no API, no clock. The same inputs and config always give the same score.

The CRI is an experimental measure of contribution behaviour. It is not a credit bureau
score and it uses no protected personal characteristics. Weights are experimental and have
not been statistically validated against lending outcomes.
"""
import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import date

MODEL_VERSION = "cri-1.0.0"

DEFAULT_CONFIG: dict = {
    "weights": {
        "on_time_rate": 0.35,
        "consistency": 0.20,
        "participation": 0.15,
        "missed_behaviour": 0.15,
        "recovery": 0.10,
        "completeness": 0.05,
    },
    "grace_days": 3,                 # paid within this many days of the due date counts as on time
    "missed_after_days": 30,         # monthly: no verified payment this long after due date is a missed contribution
    "missed_after_days_weekly": 7,
    "participation_cap_months": 24,  # full marks for participation at this length
    "missed_penalty_multiplier": 3,  # missing one third of contributions takes this factor to zero
    "min_periods": 3,                # fewer due periods than this makes the score provisional
    "neutral_recovery": 50,          # used when a miss has had no later period to recover in
}

FACTOR_LABELS = {
    "on_time_rate": "On-time contribution rate",
    "consistency": "Contribution consistency",
    "participation": "Length of verified participation",
    "missed_behaviour": "Missed contribution behaviour",
    "recovery": "Recovery after missed contributions",
    "completeness": "Record completeness",
}

# Features the model is allowed to see. Tests assert nothing else reaches the engine.
ALLOWED_INPUT_FIELDS = ("stokvel_key", "frequency", "due_date", "paid_date", "state")


@dataclass(frozen=True)
class Obligation:
    """One contribution period for one membership.

    state: paid (verified payment exists), missed (window closed with no verified payment),
           unverified (a record exists but is pending or under review), open (still inside the window).
    """

    stokvel_key: str
    frequency: str
    due_date: date
    paid_date: date | None
    state: str


def validate_config(config: dict) -> dict:
    w = config["weights"]
    if set(w) != set(DEFAULT_CONFIG["weights"]):
        raise ValueError("Weights must cover exactly: " + ", ".join(DEFAULT_CONFIG["weights"]))
    if any(v < 0 for v in w.values()) or abs(sum(w.values()) - 1.0) > 1e-9:
        raise ValueError("Weights must be non-negative and sum to 1.")
    return config


def classify(ob: Obligation, grace_days: int) -> str:
    if ob.state != "paid":
        return ob.state
    return "on_time" if (ob.paid_date - ob.due_date).days <= grace_days else "late"


def inputs_digest(obligations: list[Obligation], config: dict, as_of: date) -> str:
    payload = {
        "as_of": as_of.isoformat(),
        "config": config,
        "obligations": [
            {**asdict(o), "due_date": o.due_date.isoformat(),
             "paid_date": o.paid_date.isoformat() if o.paid_date else None}
            for o in sorted(obligations, key=lambda o: (o.stokvel_key, o.due_date))
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _streaks(flags: list[bool]) -> tuple[int, int]:
    longest = current = run = 0
    for f in flags:
        run = run + 1 if f else 0
        longest = max(longest, run)
    for f in reversed(flags):
        if not f:
            break
        current += 1
    return longest, current


def _months_between(a: date, b: date) -> int:
    return max(0, (b.year - a.year) * 12 + (b.month - a.month) + (1 if b.day >= a.day else 0))


def calculate(obligations: list[Obligation], as_of: date, config: dict | None = None,
              model_version: str = MODEL_VERSION) -> dict:
    cfg = validate_config(config or DEFAULT_CONFIG)
    grace = cfg["grace_days"]
    obs = sorted([o for o in obligations if o.due_date <= as_of], key=lambda o: (o.due_date, o.stokvel_key))
    labelled = [(o, classify(o, grace)) for o in obs]

    resolved = [(o, c) for o, c in labelled if c in ("on_time", "late", "missed")]
    on_time = sum(1 for _, c in resolved if c == "on_time")
    late = sum(1 for _, c in resolved if c == "late")
    missed = sum(1 for _, c in resolved if c == "missed")
    unverified = sum(1 for _, c in labelled if c == "unverified")
    due = len(resolved)
    paid = on_time + late

    timeline = [{"due_date": o.due_date.isoformat(), "state": c} for o, c in labelled][-36:]
    counts = {"due": due, "on_time": on_time, "late": late, "missed": missed,
              "unverified": unverified, "verified_records": paid}

    if due == 0:
        factors = {k: {"label": FACTOR_LABELS[k], "value": 0.0, "weight": w, "points": 0.0}
                   for k, w in cfg["weights"].items()}
        return {
            "model_version": model_version, "score": 0, "provisional": True, "factors": factors,
            "counts": counts, "participation_months": 0, "longest_streak": 0, "current_streak": 0,
            "recovered_misses": 0, "stokvel_count": len({o.stokvel_key for o in obs}), "timeline": timeline,
            "explanation": {
                "headline": "There is no verified contribution history yet.",
                "strengths": [],
                "improvements": ["Your index will appear after your first verified contributions."],
                "notes": [],
            },
            "inputs_digest": inputs_digest(obligations, cfg, as_of), "as_of": as_of.isoformat(),
        }

    # 1. on-time rate
    f_on_time = 100.0 * on_time / due

    # 2. consistency: streaks of paid periods, per stokvel, in due-date order
    longest = current = 0
    by_stokvel: dict[str, list[tuple[Obligation, str]]] = {}
    for o, c in resolved:
        by_stokvel.setdefault(o.stokvel_key, []).append((o, c))
    weighted_long = weighted_cur = 0.0
    for seq in by_stokvel.values():
        flags = [c in ("on_time", "late") for _, c in seq]
        lg, cu = _streaks(flags)
        longest, current = max(longest, lg), max(current, cu)
        weighted_long += lg
        weighted_cur += cu
    f_consistency = 100.0 * (0.5 * weighted_long / due + 0.5 * weighted_cur / due)

    # 3. participation length: first to last verified payment
    paid_dates = [o.paid_date for o, c in resolved if c in ("on_time", "late")]
    months = _months_between(min(paid_dates), max(paid_dates)) if paid_dates else 0
    f_participation = 100.0 * min(months / cfg["participation_cap_months"], 1.0)

    # 4. missed behaviour
    f_missed = 100.0 * max(0.0, 1.0 - cfg["missed_penalty_multiplier"] * missed / due)

    # 5. recovery: a miss is recovered when the next resolved period in the same stokvel is paid
    recoverable = recovered = 0
    for seq in by_stokvel.values():
        for i, (_, c) in enumerate(seq):
            if c == "missed" and i + 1 < len(seq):
                recoverable += 1
                if seq[i + 1][1] in ("on_time", "late"):
                    recovered += 1
    if missed == 0:
        f_recovery = 100.0
    elif recoverable == 0:
        f_recovery = float(cfg["neutral_recovery"])
    else:
        f_recovery = 100.0 * recovered / recoverable

    # 6. completeness: verified records as a share of all records submitted
    f_complete = 100.0 * paid / (paid + unverified) if (paid + unverified) else 0.0

    values = {
        "on_time_rate": f_on_time, "consistency": f_consistency, "participation": f_participation,
        "missed_behaviour": f_missed, "recovery": f_recovery, "completeness": f_complete,
    }
    factors = {
        k: {"label": FACTOR_LABELS[k], "value": round(values[k], 2), "weight": w,
            "points": round(values[k] * w, 2)}
        for k, w in cfg["weights"].items()
    }
    score = int(round(sum(values[k] * w for k, w in cfg["weights"].items())))
    score = max(0, min(100, score))
    provisional = due < cfg["min_periods"]

    # ---------------- plain-language explanation
    strengths, improvements, notes = [], [], []
    plural = lambda n, word: f"{n} {word}" if n == 1 else f"{n} {word}s"  # noqa: E731
    if on_time:
        strengths.append(f"{on_time} of {due} contributions paid on time.")
    strengths.append(f"{plural(paid, 'verified contribution record')}.")
    if current >= 2:
        strengths.append(f"{current} consecutive contributions paid without a break.")
    if months >= 1:
        strengths.append(f"{plural(months, 'month')} of verified participation.")
    if missed and recovered:
        if missed == 1:
            strengths.append("One missed contribution followed by a successful recovery.")
        elif missed == recovered:
            strengths.append(f"{missed} missed contributions, each followed by a successful recovery.")
        else:
            strengths.append(f"{recovered} of {missed} missed contributions followed by a successful recovery.")
    if missed == 0:
        strengths.append("No missed contributions on record.")

    if late:
        improvements.append(f"{plural(late, 'contribution')} paid after the due date. Paying within {grace} days of the due date counts as on time.")
    if missed and recovered < missed:
        improvements.append(f"{plural(missed - recovered, 'missed contribution')} without a recovery yet. Your next verified contribution improves this.")
    if unverified:
        improvements.append(f"{plural(unverified, 'contribution')} still waiting for verification. Ask your treasurer to review.")
    if months < cfg["participation_cap_months"]:
        improvements.append(f"Participation counts up to {cfg['participation_cap_months']} months. Your index grows as your verified history grows.")
    if provisional:
        notes.append(f"Provisional index. Fewer than {cfg['min_periods']} contribution periods are on record.")
    notes.append("A missed contribution lowers the index for a time. Recovery restores part of the index.")

    return {
        "model_version": model_version, "score": score, "provisional": provisional, "factors": factors,
        "counts": counts, "participation_months": months, "longest_streak": longest, "current_streak": current,
        "recovered_misses": recovered, "stokvel_count": len(by_stokvel), "timeline": timeline,
        "explanation": {
            "headline": f"Your reliability index is {score} out of 100.",
            "strengths": strengths, "improvements": improvements, "notes": notes,
        },
        "inputs_digest": inputs_digest(obligations, cfg, as_of), "as_of": as_of.isoformat(),
    }
