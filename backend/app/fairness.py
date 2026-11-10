"""Fairness evaluation.

Protected attributes live in member_demographics, apart from scoring inputs. This module is the
only reader. It reports differences. It never adjusts an individual score.
Results on synthetic data demonstrate the method only. They are not evidence of real-world fairness.
"""
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import scoring, services
from .models import MemberDemographics, User

MIN_GROUP_SIZE = 30
THRESHOLD = 75
BINS = [0, 20, 40, 60, 70, 80, 90, 101]
BIN_LABELS = ["0-19", "20-39", "40-59", "60-69", "70-79", "80-89", "90-100"]

LIMITATIONS = [
    "This run uses synthetic members. Synthetic results show how the audit works. They prove nothing about real members.",
    "Fairness cannot be established from synthetic data alone. A real pilot with informed consent is required.",
    "Groups below 30 members are flagged. Differences in small groups are unreliable.",
    "Equal average scores do not prove equal treatment. Access to stable income and to stokvels differs between groups.",
    "The error-rate analysis uses a synthetic behaviour label. No real repayment outcome exists yet.",
    "The audit covers age band and gender only. Other characteristics and their combinations are not tested.",
    "Scores are never adjusted by demographic group. Findings feed a review of the model rules.",
]


def _group_table(df: pd.DataFrame, column: str) -> dict:
    groups = []
    overall = float(df["score"].mean())
    for name, g in df.groupby(column, dropna=False):
        hist = pd.cut(g["score"], bins=BINS, labels=BIN_LABELS, right=False).value_counts().reindex(BIN_LABELS, fill_value=0)
        groups.append({
            "group": str(name), "n": int(len(g)), "small_sample": bool(len(g) < MIN_GROUP_SIZE),
            "mean": round(float(g["score"].mean()), 1), "median": float(g["score"].median()),
            "std": round(float(g["score"].std(ddof=0)), 1),
            "p25": float(g["score"].quantile(0.25)), "p75": float(g["score"].quantile(0.75)),
            "min": int(g["score"].min()), "max": int(g["score"].max()),
            "share_at_or_above_threshold": round(float((g["score"] >= THRESHOLD).mean()), 3),
            "difference_from_overall": round(float(g["score"].mean()) - overall, 1),
            "distribution": [{"bin": b, "count": int(c)} for b, c in hist.items()],
        })
    recorded = [g for g in groups if g["group"] != "Not recorded"]
    adequate = [g for g in recorded if not g["small_sample"]]
    gap = round(max(g["mean"] for g in recorded) - min(g["mean"] for g in recorded), 1) if len(recorded) > 1 else 0.0
    return {"attribute": column, "groups": groups, "largest_mean_gap": gap,
            "gap_is_reliable": len(adequate) == len(recorded) and len(recorded) > 1}


def _error_rates(df: pd.DataFrame, column: str) -> list[dict]:
    out = []
    for name, g in df.groupby(column, dropna=False):
        pos, neg = g[g["label"]], g[~g["label"]]
        out.append({
            "group": str(name), "n": int(len(g)), "small_sample": bool(len(g) < MIN_GROUP_SIZE),
            "false_negative_rate": round(float((pos["score"] < THRESHOLD).mean()), 3) if len(pos) else None,
            "false_positive_rate": round(float((neg["score"] >= THRESHOLD).mean()), 3) if len(neg) else None,
            "labelled_reliable": int(len(pos)), "labelled_other": int(len(neg)),
        })
    return out


def run_fairness_report(db: Session) -> dict:
    model = services.active_model(db)
    rows = db.execute(select(User, MemberDemographics).outerjoin(
        MemberDemographics, MemberDemographics.user_id == User.id).where(User.role == "member")).all()
    records = []
    for user, demo in rows:
        result = services.compute_score(db, user.id, persist=False)
        if result["counts"]["due"] == 0:
            continue
        records.append({
            "score": result["score"],
            "age_band": (demo.age_band if demo and demo.age_band else "Not recorded"),
            "gender": (demo.gender if demo and demo.gender else "Not recorded"),
            "archetype": demo.synthetic_archetype if demo else None,
            "synthetic": user.is_synthetic,
        })
    base = {
        "model_version": model.version, "threshold": THRESHOLD, "min_group_size": MIN_GROUP_SIZE,
        "scoring_inputs": list(scoring.ALLOWED_INPUT_FIELDS),
        "protected_attributes_used_in_scoring": [],
        "limitations": LIMITATIONS,
    }
    if not records:
        return {**base, "members_evaluated": 0, "data_is_synthetic": False, "attributes": [], "missing_data": {},
                "error_analysis": {"available": False, "reason": "No scored members."}, "flags": ["No scored members to evaluate."]}
    df = pd.DataFrame(records)
    attributes = [_group_table(df, "age_band"), _group_table(df, "gender")]

    missing = {}
    for col in ("age_band", "gender"):
        miss = df[df[col] == "Not recorded"]
        have = df[df[col] != "Not recorded"]
        missing[col] = {
            "missing": int(len(miss)), "share_missing": round(len(miss) / len(df), 3),
            "mean_score_missing": round(float(miss["score"].mean()), 1) if len(miss) else None,
            "mean_score_recorded": round(float(have["score"].mean()), 1) if len(have) else None,
        }

    labelled = df[df["archetype"].notna()].copy()
    if len(labelled):
        labelled["label"] = labelled["archetype"] == "reliable"
        error = {
            "available": True, "label_is_synthetic": True,
            "label_definition": "Synthetic archetype equals 'reliable'. Prediction: index at or above the threshold.",
            "by_age_band": _error_rates(labelled, "age_band"), "by_gender": _error_rates(labelled, "gender"),
        }
    else:
        error = {"available": False,
                 "reason": "No outcome label exists. False-positive and false-negative analysis needs a defined, observed outcome."}

    flags = []
    for a in attributes:
        small = [g["group"] for g in a["groups"] if g["small_sample"]]
        if small:
            flags.append(f"Insufficient sample size for {a['attribute'].replace('_', ' ')}: {', '.join(small)}.")
        if a["largest_mean_gap"] >= 5:
            flags.append(f"Mean index differs by {a['largest_mean_gap']} points across {a['attribute'].replace('_', ' ')} groups. Review needed.")
    if bool(df["synthetic"].all()):
        flags.append("All evaluated members are synthetic.")
    return {**base, "members_evaluated": int(len(df)), "data_is_synthetic": bool(df["synthetic"].all()),
            "overall": {"mean": round(float(df["score"].mean()), 1), "median": float(df["score"].median()),
                        "std": round(float(df["score"].std(ddof=0)), 1)},
            "attributes": attributes, "missing_data": missing, "error_analysis": error, "flags": flags}
