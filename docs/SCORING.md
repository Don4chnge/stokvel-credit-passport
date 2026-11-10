# Contribution Reliability Index (CRI)

Model version `cri-1.0.0`. A deterministic, rule-based index from 0 to 100.

**It is not a credit bureau score.** The weights are experimental. They have not been validated against
lending outcomes. No real pilot data exists yet.

## Inputs

The engine receives a list of obligations. Each has five fields and nothing else:
`stokvel_key`, `frequency`, `due_date`, `paid_date`, `state`. No name, age, gender, race, religion or
other personal attribute reaches the engine. Tests assert this.

Each due period is classed as: on time (paid within 3 days of the due date), late, missed (no verified
payment 30 days after the due date, 7 days for weekly groups), unverified (a record waits for review) or
open.

## Factors and weights

| Factor | Weight | How it is measured |
| --- | --- | --- |
| On-time contribution rate | 35% | On-time payments divided by due periods |
| Contribution consistency | 20% | Longest and current streaks of paid periods |
| Length of verified participation | 15% | Months from first to last verified payment, capped at 24 |
| Missed contribution behaviour | 15% | Falls to zero when one third of periods are missed |
| Recovery after missed contributions | 10% | Share of misses followed by a paid period |
| Record completeness | 5% | Verified records as a share of all records submitted |

Weights and thresholds live in the `score_models` table as JSON. Change them by adding a new model
version. Every snapshot stores the model version, the factor values and a SHA-256 digest of its inputs, so
any index is reproducible.

Design choices:

- A miss lowers the index for a time. A recovery restores part of it.
- A miss with no later period yet gets a neutral recovery value, not zero.
- Fewer than three due periods makes the index provisional.

## Why no machine learning yet

There is no outcome to learn from. A model trained on synthetic data would learn the rules used to
generate that data. The engine is separated from the API so a statistical model can replace it once a
pilot produces real, consented outcome data.

## Fairness evaluation

`GET /api/v1/analytics/fairness` (platform administrator only):

- Protected attributes are stored in `member_demographics`, apart from scoring inputs. `fairness.py` is
  the only reader.
- Reports index distributions, averages, medians and quartiles by age band and gender, with sample sizes.
- Flags groups under 30 members and gaps of 5 points or more.
- Reports missing demographic data and the average index of members with missing data.
- Reports false-positive and false-negative rates only where an outcome label exists. The seeded label is
  a synthetic behaviour archetype and is marked as such.
- Never adjusts an individual score.

Fairness cannot be established from synthetic data. The report demonstrates the method only.
