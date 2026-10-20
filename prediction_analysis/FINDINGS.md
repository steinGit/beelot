# Prediction analysis findings

This report records the experiment before production integration. Current
application behavior is documented in [prediction.md](../docs/develop/prediction.md).

The historical-increment predictor has a lower endpoint MAE than the linear comparison at all three requested horizons. **J=10 is the overall winner for 14, 21 and 28 days.**

| Horizon | Best J | Endpoint MAE (°Cd) | RMSE (°Cd) | Linear MAE (°Cd) | MAE reduction |
|---|---:|---:|---:|---:|---:|
| 14 days | 10 | 20.012 | 26.044 | 28.865 | 30.7% |
| 21 days | 10 | 26.202 | 34.158 | 46.563 | 43.7% |
| 28 days | 10 | 31.570 | 41.142 | 68.216 | 53.7% |

The live algorithm currently forecasts 14 days. For the 21- and 28-day comparisons, its existing slope is extended unchanged as an experimental baseline.

![All parameter combinations](results/parameter_scores.png)

## All requested J values

| J | 14-day MAE (°Cd) | 21-day MAE (°Cd) | 28-day MAE (°Cd) |
|---:|---:|---:|---:|
| 1 | 27.121 | 35.564 | 42.922 |
| 2 | 23.314 | 30.672 | 37.068 |
| 5 | 20.895 | 27.360 | 32.864 |
| 7 | 20.196 | 26.393 | 31.779 |
| 10 | 20.012 | 26.202 | 31.570 |

## Choosing parameters for a future BeeLot implementation

J=10 is the fixed choice supported by the requested full-period ranking. However, its advantage over J=7 is only about 0.18–0.21 °Cd in MAE, and the paired year-block 95% intervals include zero for all horizons. The experiment does not establish a unique winner between seven and ten years.

In the recent 2017–2026 subset, J=7 is best at every horizon:

| Horizon | Recent J=7 MAE (°Cd) | Recent J=10 MAE (°Cd) |
|---|---:|---:|
| 14 days | 19.962 | 20.003 |
| 21 days | 25.858 | 26.082 |
| 28 days | 31.098 | 31.565 |

Selecting J on 1980–2009 also chooses J=10 for every horizon. The full report evaluates that frozen choice on 2010–2026. Recent-period and subgroup winners are descriptive, not independently validated adaptive selection rules.

## Scope and reproducibility

- 40 fixed random locations sampled approximately uniformly by DACH land area: 27 Germany, nine Austria, four Switzerland; seed 20261020.
- 1980–2026 inclusive means 47 target years. Weather input begins in 1970 for the ten-year initial history. The 2026 archive cutoff is 2026-10-13; only fully observed, within-year horizons are scored.
- 657,200 origins for 14 days; 644,040 for 21 days; 630,880 for 28 days. Across the five J values plus the linear baseline: 11,592,720 endpoint predictions and 242,341,680 scored daily trajectory values across all horizon combinations.
- GTS comes from the unmodified BeeLot JavaScript `calculateGTS()` function, including its monthly weighting and rounding. Historical reference dates align by calendar month/day, with interpolation for February 29 in non-leap reference years.
- Temperature requests use BeeLot's exact `/v1/era5` endpoint and defaults. That path uses Open-Meteo's historical `archive_best_match` blend, including an IFS transition from 2017. These are archive hindcasts, not a homogeneous ERA5-only climate study or archived operational forecasts.
- Endpoint MAE is the primary criterion. RMSE, signed bias, tail errors and complete-trajectory MAE/RMSE are retained. All methods share identical origins within each horizon.
- The best J for an individual origin is also exported, but it uses the future outcome and is a hindsight diagnostic, not an implementable selection rule.

## Files and validation

- [Full report, figures and subgroup analysis](results/REPORT.md).
- [Overall ranking](ranking.csv) and [reproduction instructions](README.md).
- `results/forecast_errors.npz` retains every endpoint error and per-origin trajectory score; `results/hindsight_best_J.csv.gz` retains individual hindsight winners.
- `results/summary.json` records configuration, input/source hashes, runtime versions, recommendations and bootstrap intervals. Raw responses remain in `cache/`.
- All 13 analysis regression tests pass. An independent scalar verifier checks 3,690 method trajectories, explicit calendar boundaries and every overall endpoint metric. Separate annual requests for 1980, 2018 and 2025 match all 1,096 temperatures in the bulk download at the checked site.
- Existing website validation passes: 36 Jest suites / 182 tests and ESLint. New Python code passes Ruff and Black.
- The original experiment is isolated in `prediction_analysis/`. Its compact gzip input cache, this findings file and the overall ranking are committed; regenerated detailed results and Python bytecode are ignored by Git. The subsequent production integration is documented separately.

Weather data: [Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Country geometry: [Natural Earth](https://www.naturalearthdata.com/), public domain. See the full report for attribution and methodological limits.
