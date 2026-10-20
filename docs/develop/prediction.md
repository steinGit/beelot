# Historical-average GTS prediction

`assets/js/prediction.js` implements the same predictor tested in
`prediction_analysis`: for each future calendar day, average the GTS increments
from that calendar origin in the previous J years and add the mean to the known
current GTS. J is an integer from 3 through 10, default 10. The preview is 14,
21 or 28 days, default 14, and stops at December 31.

The loader uses the original `fetchHistoricalData()` API and location-owned
full-year caches, with forecast fallback disabled for reference years. It
requires all J immediately preceding complete years and validates daily
temperature coverage. It uses the original `calculateGTS()` function. Missing
reference values produce an explicit prediction-unavailable message; observed
charts remain usable. February 29 in a non-leap reference year is interpolated
between February 28 and March 1. Predictions are rounded to nine decimal places
to remove numerical cancellation noise at exact threshold equality.

`predictionSettings.js` validates the shared browser preferences under
`beelotPredictionSettings`. These settings apply to every location. Each plot
execution captures them with its location and generation, preventing old
requests from changing a newer location or forecast setting. Returning from
settings through browser history and cross-page storage events refresh the
controls. The plot toggle affects the GTS chart only; the information table
always uses its selected preview window.

A fresh page visit starts at today's local date instead of restoring a stale
date from the previous visit. Explicit date changes during a visit remain
available when switching location tabs.

The forecast is calculated once per execution and shared by the information
table and selected-year GTS plot. Forecast points are separate from measured
GTS, temperature arrays and cached comparison curves. Chart.js segment styling
marks only future segments with a dashed line. Tooltips identify prediction
values to two decimal places, and spreadsheet exports include a `Prädiktion ab` metadata row. The
enabled date axis uses a dark background for white date labels and marks the
actual local current date red when it falls within the visible selected year.
A vertical red grid line marks that date across the plot area while prediction
plotting is enabled.

Historical curves extend with observed data through the forecast end, while
only the selected year's future is dashed. Plot values align by calendar date,
so a leap day does not shift the March–December curves. Point-marker density
uses the observed window length for every curve, excluding the forecast tail.
Axis labels and date colors use category tick values rather than transient
indices, including during sampling, hidden initialization and resizing.

## Offline empirical date errors

The optional `predictionCalibration.js` research artifact contains the
conditional mean absolute crossing-date error for 100 distinct active plant
start thresholds, J=3..10 and all three horizons, using 40 DACH locations and
1980–2026. The archive cutoff is 2026-10-13 and only completely observed
within-year horizons are scored. Duplicate plant thresholds receive one vote
per rolling daily origin. These errors average different lead times within H;
they do not exclusively evaluate forecasts made H days before an event.

The application intentionally displays no uncertainty column and does not load
the calibration artifact. Date MAE in the offline study is conditional on both
the forecast and reference crossing occurring within H. It is not a confidence
interval, a location-specific error estimate, or an estimate of actual flowering
accuracy. Missed crossings and false alarms are reported separately.

To regenerate the optional research artifact from existing cached weather:

```bash
conda activate beelot-prediction
python prediction_analysis/export_uncertainty.py
```

The generator uses no network requests and accepts ordinary or gzip-compressed
cache files. Its CLI supports `-h`, `--help` and `-?`, as well as custom cache,
module-output and report paths. The module stays in `prediction_analysis/results/thresholds/`.
Counts and input/source/output hashes are saved
in `prediction_analysis/results/thresholds/production_calibration.json`. All 900
scores overlapping the previous J=5,7,10 threshold study agree within the
export's six-decimal rounding precision.
