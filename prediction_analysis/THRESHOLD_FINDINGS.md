# Threshold-date findings

This report records the threshold study before production integration. The
application now uses the historical-average method; see
[prediction.md](../docs/develop/prediction.md) for the implemented behavior.

The historical-increment forecast can be evaluated directly in **calendar days
of error in a flowering-start GTS crossing**. This follow-up uses the same 40
DACH sites, target years 1980–2026, observed archive cutoff 2026-10-13, exact
BeeLot GTS calculation and six forecast methods as the original experiment.
It uses 100 distinct active start thresholds representing 126 plant entries.
The recommendation to add honey supers is excluded as a separate plant entry.

For J=10, timing errors among crossings both forecast and observed within the
window are:

| Forecast window | Mean absolute date error | 90th percentile | Mean signed error | Actual crossings announced | Announced crossings occurring |
|---:|---:|---:|---:|---:|---:|
| 14 days | 1.066 days | 3 days | +0.182 days | 90.8% | 93.5% |
| 21 days | 1.451 days | 3 days | +0.262 days | 92.0% | 94.7% |
| 28 days | 1.779 days | 4 days | +0.345 days | 92.8% | 95.5% |

Positive signed error means the prediction is late. These are rolling daily
forecasts with different lead times inside each window, not exclusively
predictions made exactly 14, 21 or 28 days before the crossing. Several origins
can refer to the same site's seasonal threshold crossing.

The conditional MAE omits misses and false alarms from its date comparison;
they remain explicit in recall, precision and counts. For example, J=10 misses
9.2% of actual crossings inside the 14-day window. Of its announced crossings,
6.5% do not occur inside that window. Neither number measures whether an event
occurs later in the year.

The original linear method has conditional timing MAE 1.214 days and announces
83.0% of actual crossings inside the 14-day window. Its precision is 94.3%.

## Early versus later thresholds

The timing metric exposes the seasonal issue hidden by a single GTS MAE.
For J=10 and the 14-day window:

| Example plants | GTS start | Conditional MAE | Actual crossings announced |
|---|---:|---:|---:|
| Snowdrop / winter aconite | 35 | 3.072 days | 73.8% |
| Crocus / hazel / winter jasmine | 65 | 2.793 days | 75.0% |
| Forsythia / willow | 175 | 1.847 days | 81.4% |
| Cherry | 365 | 1.336 days | 88.3% |
| Apple / oilseed rape / lilac | 480 | 1.157 days | 90.6% |
| Black locust | 820 | 0.913 days | 93.2% |

## Comparing J on identical cases

Missing difficult events can make conditional timing MAE misleading. The full
report therefore also averages absolute crossing-lead errors after capping
both leads at H+1. All six methods share identical cases: every pending
threshold with an actual crossing or a crossing predicted by any method inside
H. This includes misses and false alarms. A capped error is a lower bound when
one crossing lies beyond the horizon, not an uncensored date error.

| H | J=1 | J=2 | J=5 | J=7 | J=10 | Linear baseline |
|---:|---:|---:|---:|---:|---:|---:|
| 14 | 1.594 | 1.355 | 1.230 | 1.191 | 1.176 | 1.447 |
| 21 | 2.094 | 1.786 | 1.617 | 1.563 | 1.545 | 2.176 |
| 28 | 2.517 | 2.149 | 1.939 | 1.874 | 1.856 | 2.975 |

All entries are capped lead MAE in days. J=10 wins descriptively over the full
period, with only a small advantage over J=7. Selection on 1980–2009 also picks
J=10 at all horizons. On validation years 2010–2026, J=10 wins for 14/21 days
and J=7 for 28 days; the same winners occur in 2017–2026. No new adaptive
selection rule or statistical significance claim follows from these rankings.

## Reproduction and interpretation

Run `python prediction_analysis/threshold_analysis.py` in the existing conda
environment. No new downloads or dependencies are required. Both ordinary JSON
and gzip-compressed weather caches work. [The full report](results/thresholds/REPORT.md)
contains the parameter tables; `metrics.csv` includes periods, origin months
and individual thresholds. `crossings.npz` stores every included case and all
predicted/actual leads. `summary.json` maps thresholds to plant names and records
source and input hashes.

Validation passes all 21 offline Python tests, including eight threshold tests
and a compressed-cache end-to-end fixture, plus ESLint, Ruff and Black checks.
An independent scalar reconstruction checked 2,616 method trajectories across
all 40 weather sites, including misses and false alarms; a separate aggregation
matched all 54 overall MAE, bias and capped-score values. The saved verification
record is `results/thresholds/verification.json`.

These are errors in predicting a **modelled GTS threshold crossing**. They do
not establish actual flowering-date accuracy, which requires flowering
observations. Weather archive limitations from [FINDINGS.md](FINDINGS.md) still
apply. The production BeeLot algorithm remains unchanged.
