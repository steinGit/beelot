# Prediction analysis

Research code for choosing historical GTS prediction windows. The completed
experiment used the original linear BeeLot algorithm as its baseline. The
subsequent [production integration](../docs/develop/prediction.md) uses the
historical-average method. Start with [FINDINGS.md](FINDINGS.md) for the
completed experiment and [the full report](results/REPORT.md) for plots and
subgroup results.

The follow-up [threshold-date findings](THRESHOLD_FINDINGS.md) express forecast
errors in calendar days until a plant's GTS start threshold is first reached.
The [threshold report](results/thresholds/REPORT.md) retains all J combinations,
missed events, false alarms and a comparison on shared cases.

## Reproduce

Use a conda environment for numerical and plotting dependencies. Node is needed
because the analysis imports BeeLot's actual `calculateGTS()` implementation;
there is no Python reimplementation of its monthly weights or rounding.

```bash
conda env create --file prediction_analysis/environment.yml
conda activate beelot-prediction

# Check the offline regression suite before downloading anything.
python -m unittest discover -s prediction_analysis -p 'test_*.py'

# Download once, resuming from complete validated cache files.
python prediction_analysis/data.py --end-date 2026-10-13

# Evaluate every requested parameter and generate the report and figures.
python prediction_analysis/analyze.py
python prediction_analysis/report.py

# Reconstruct random daily trajectories with an independent scalar calculation.
python prediction_analysis/verify_results.py

# Measure threshold crossing dates using existing weather, without API calls.
python prediction_analysis/threshold_analysis.py

# Export an optional research artifact for every J from 3 through 10.
python prediction_analysis/export_uncertainty.py
```

All CLIs support `-h`, `--help` and `-?`; help describes their arguments.
Defaults resolve relative to this directory, not the current working directory.
The sampling seed is 20261020. The checked-in `locations.json` contains 40 random
sites within the checked-in Natural Earth country polygons: 27 Germany, nine
Austria and four Switzerland. Sites are sampled approximately uniformly by land
area across DACH, rather than equally by country or from a list of cities.

To deliberately replace the sample, use `data.py --prepare --seed NUMBER`.
Existing cached files must match their request coordinates; mismatches fail
explicitly rather than silently changing the experiment.

## Experimental design

- Target years: 1980–2026 inclusive, with 1970–1979 as the initial reference
  history. This is 47 target years. The current year stops at the explicit
  archive cutoff; no forecast values are used as evaluation truth.
- Horizons H: 14, 21 and 28 days. History lengths J: 1, 2, 5, 7 and 10 previous
  years. Every target day uses the mean of the historical **increments** from
  the corresponding origin date, anchored at the known current GTS.
- Historical years align by calendar month/day. Missing February 29 values in
  non-leap reference years interpolate between February 28 and March 1. This is
  separate from the existing chart's intentional day-index alignment.
- Forecasts stop at the year boundary, as in the live algorithm. A horizon is
  scored only when its entire future window exists in the archive. All methods
  use the same eligible origins within each horizon.
- Primary score: endpoint MAE in °Cd. Also report endpoint RMSE, signed bias,
  median and tail absolute errors, and trajectory MAE/RMSE over all days 1..H.
- Compare against the unchanged fourteen-day linear slope. Extending that
  slope to horizons 21/28 is an analysis baseline, not existing live behavior.
- Fit J on 1980–2009, then evaluate the frozen choice on 2010–2026. The complete
  period rankings, recent-period rankings, seasonal/monthly, country, yearly and
  location metrics are also retained. The future of a target year never enters
  its historical reference window.
- Paired whole-year bootstrap intervals avoid treating overlapping daily
  origins as independent observations. They are exploratory error-difference
  intervals, not individual prediction intervals or spatial uncertainty bounds.

Open-Meteo returns reanalysis, not perfect station truth. These are hindcasts
with an exact known GTS origin, not archived operational forecasts. The full
report explains the limits of parameter selection and climate non-stationarity.

`threshold_analysis.py` imports active `TS_start` values from the unchanged
BeeLot plant dataset. A crossing is the first day with GTS >= the threshold.
Already reached thresholds are excluded; identical thresholds count only once
per origin. Scores compare rolling daily forecasts within each complete H-day
window, rather than exclusively forecasts issued exactly H days before an event.
The conditional date MAE must be read together with event recall and precision.
The report also compares all methods on identical cases using a capped crossing
lead and a common matched subset. Reference crossings come from archive-derived
GTS, not observed flowering. The new CLI accepts both plain and gzip-compressed
weather cache files; all outputs are saved under `results/thresholds/` by default.

## Files and storage

All JSON readers accept both `.json` and `.json.gz`. If a requested `.json`
file is absent, its `.json.gz` counterpart is selected automatically; explicit
gzip filenames also work in manifests and CLI paths. When both versions exist,
the explicitly requested file takes precedence. This covers weather responses,
the manifest, request budget, batch validation, backtests, reports, threshold
analysis and result verification. No manual decompression is needed.

The downloader reuses compressed weather without a network request. Updating
an existing compressed manifest or budget preserves gzip and does not create
an uncompressed duplicate. New JSON files remain uncompressed unless the output
name ends in `.gz`. Cache SHA-256 values describe the **uncompressed original
bytes** (`sha256_scope: uncompressed_file`), so lossless gzip compression does
not invalidate input provenance. Source-code hashes are checked independently;
verification still rejects results from different source revisions.

`data.py` validates complete arrays of finite temperatures, caches raw API JSON
atomically, records provenance, and respects persistent weighted request
budgets. Requests use the same `/v1/era5` endpoint, `temperature_2m_mean`, rounded
coordinates and `Europe/Berlin` time zone as BeeLot. It does not use the forecast
fallback when evaluating historical truth. Downloads are sequential because
network service limits, rather than CPU throughput, constrain this step.

The `/v1/era5` path is an alias of the archive API. Without `models=`, its
default is `archive_best_match`, combining ERA5, ERA5-Land and, from 2017,
ECMWF IFS. The analysis deliberately keeps BeeLot's exact default request.
Consequently, this is not a homogeneous ERA5-only climate experiment; model
changes across decades are a potential confound. A pure-model sensitivity run
would be a separate experiment.

`analyze.py` uses NumPy for daily forecast arrays and aggregation. The complete
per-origin endpoint errors and trajectory metrics are stored without precision
loss in `results/forecast_errors.npz`. Predictions can be reconstructed as
actual endpoint GTS plus signed error. `results/summary.json` documents columns,
configuration, source hashes, request URLs and all recommendations.

`results/hindsight_best_J.csv.gz` records the best J for every individual origin
and horizon, including tie counts. This choice uses the future outcome and is
an oracle diagnostic; it cannot select J in the live application.

`report.py` produces `results/REPORT.md` plus PNG and SVG figures. `metrics.csv`
contains all subgroup scores; `ranking.csv` contains the overall comparison.
The compact gzip input cache is committed for reproducibility. Detailed results,
Python bytecode and interpreter caches are ignored by Git. The concise findings
and `ranking.csv` are also committed at the top level of this directory.

`verify_results.py` checks all input/source hashes, reaggregates overall endpoint
metrics, and independently reconstructs 200 random origins per horizon plus
calendar boundary cases. It compares all six methods, their endpoint errors,
and their complete-trajectory MAE/MSE against the saved numerical arrays.

## Data attribution

Weather data: [Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api),
based on Copernicus ERA5; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
This experiment transforms temperature data into GTS, predictions and errors.
Country geometry: [Natural Earth](https://www.naturalearthdata.com/), public
domain; filtered source and checksum are retained in `boundaries.geojson`.

The [API pricing documentation](https://open-meteo.com/en/pricing) explains
weighted calls. A long multi-decade request counts as multiple calls. The
downloader waits at minute/hour/day boundaries and stops explicitly on HTTP
429; restarting retains completed downloads. It never bypasses rate limits.
