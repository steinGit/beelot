#!/usr/bin/env python3
"""Measure errors in forecast dates of BeeLot's flowering-start thresholds.

Reuse the cached weather and original backtest methods without modifying the
live application. Missed events and false alarms remain explicit in the scores.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np
from numpy.typing import NDArray

from analyze import (
    HORIZONS,
    METHODS,
    FloatArray,
    calendar_alignment,
    forecast_errors,
    write_csv,
)
from analyze import compute_gts as cached_gts
from data import ROOT, json_file_sha256, message, write_json
from data import read_json as cached_json
from data import resolve_json_file as existing_file


def load_thresholds() -> list[dict]:
    """Import active plant metadata directly from BeeLot's JavaScript module."""
    result = subprocess.run(
        ["node", str(ROOT / "thresholds_bridge.mjs")],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    plants = json.loads(result.stdout)
    if not plants or any(
        not isinstance(item.get("plant"), str)
        or not isinstance(item.get("threshold"), (int, float))
        or not np.isfinite(item["threshold"])
        or item["threshold"] <= 0
        for item in plants
    ):
        raise ValueError("BeeLot plant data must contain finite positive thresholds.")
    return plants


def crossing_leads(
    curve: FloatArray, predictions: FloatArray, thresholds: FloatArray
) -> tuple[NDArray, NDArray, NDArray]:
    """Return actual/predicted first crossing leads and not-yet-reached masks.

    Predictions have axes origin, future day, method. A lead of H+1 means no
    crossing within H days, including an event absent from the observed year.
    Only the comparison is rounded to nine decimals to remove cancellation
    noise when reconstructing GTS from signed errors; weather is not rounded.
    """
    count, horizon, methods = predictions.shape
    if horizon > 254:
        raise ValueError("Crossing leads require a horizon of at most 254 days.")
    if np.any(np.diff(curve) < 0) or np.any(np.diff(thresholds) <= 0):
        raise ValueError("GTS must be monotone and thresholds strictly increasing.")
    pending = curve[:count, None] < thresholds[None, :]
    actual_dates = np.searchsorted(curve, thresholds, side="left")
    actual = np.clip(
        actual_dates[None, :] - np.arange(count)[:, None], 1, horizon + 1
    ).astype(np.uint8)
    # NaN marks unobserved tails, used only by origins with shorter horizons.
    ordered = np.moveaxis(np.round(predictions, 9), 2, 1).copy()
    if np.any(np.diff(ordered, axis=2) < -1e-8):
        raise ValueError("Forecast GTS must be monotone.")
    ordered[np.isnan(ordered)] = np.inf
    predicted = np.empty((count, methods, len(thresholds)), dtype=np.uint8)
    for origin in range(count):
        for method in range(methods):
            predicted[origin, method] = (
                np.searchsorted(ordered[origin, method], thresholds, side="left") + 1
            )
    return actual, np.moveaxis(predicted, 1, 2), pending


def score(block: dict[str, NDArray], mask: NDArray, horizon: int) -> list[dict]:
    """Score shared cases and preserve misses instead of silently dropping them."""
    actual = block["actual_lead"][mask].astype(np.int16)
    predicted = block["predicted_lead"][mask].astype(np.int16)
    if not len(actual):
        return []
    actual_hit = actual <= horizon
    common_hit = actual_hit & np.all(predicted <= horizon, axis=1)
    rows = []
    for index, method in enumerate(METHODS):
        predicted_hit = predicted[:, index] <= horizon
        matched = actual_hit & predicted_hit
        differences = predicted[:, index] - actual
        matched_errors = differences[matched]
        absolute = np.abs(matched_errors)
        tp = int(matched.sum())
        fp = int((~actual_hit & predicted_hit).sum())
        fn = int((actual_hit & ~predicted_hit).sum())
        rows.append(
            {
                "horizon": horizon,
                "method": method,
                "cases": len(actual),
                "actual_events": int(actual_hit.sum()),
                "matched_events": tp,
                "missed_events": fn,
                "false_alarms": fp,
                "recall": tp / (tp + fn) if tp + fn else None,
                "precision": tp / (tp + fp) if tp + fp else None,
                "matched_mae_days": float(absolute.mean()) if tp else None,
                "matched_bias_days": float(matched_errors.mean()) if tp else None,
                "matched_rmse_days": (
                    float(np.sqrt(np.mean(matched_errors.astype(float) ** 2)))
                    if tp
                    else None
                ),
                "matched_median_days": float(np.median(absolute)) if tp else None,
                "matched_p90_days": float(np.quantile(absolute, 0.9)) if tp else None,
                "common_matched_events": int(common_hit.sum()),
                "common_matched_mae_days": (
                    float(np.abs(differences[common_hit]).mean())
                    if common_hit.any()
                    else None
                ),
                "capped_lead_mae_days": float(np.abs(differences).mean()),
            }
        )
    return rows


def build_report(rows: list[dict], metadata: dict, output: Path) -> None:
    """Write an interpretable timing report and the complete parameter table."""
    overall = [
        row for row in rows if row["group"] == "period" and row["value"] == "overall"
    ]
    lines = [
        "# Threshold crossing dates",
        "",
        "The error is forecast crossing date minus archive-derived crossing date, "
        "in whole calendar days. Negative bias means too early; positive means too late.",
        "",
        f"The study evaluates {len(metadata['locations'])} cached DACH sites, "
        f"{metadata['start_year']}–{metadata['end_year']}, and "
        f"{len(metadata['thresholds'])} distinct active plant start thresholds "
        f"representing {len(metadata['plants'])} plant entries. "
        "Repeated thresholds receive one vote per origin, irrespective of plant count.",
        "",
        "## Timing among events forecast and observed within the horizon",
        "",
        "MAE is conditional on both crossings existing within H days. "
        "Recall is the fraction of actual crossings announced within H days. "
        "Precision is the fraction of announced crossings that occur within H days. "
        "These are rolling daily forecasts: several origins can refer to one seasonal event.",
        "",
        "| H | Method | Matched MAE (days) | Bias (days) | P90 (days) | Recall | Precision |",
        "|---:|---|---:|---:|---:|---:|---:|",
    ]
    for row in overall:
        lines.append(
            f"| {row['horizon']} | {row['method']} | {row['matched_mae_days']:.3f} "
            f"| {row['matched_bias_days']:+.3f} | {row['matched_p90_days']:.1f} "
            f"| {row['recall']:.1%} | {row['precision']:.1%} |"
        )
    lines += [
        "",
        "## Shared-case comparison",
        "",
        "Conditional timing scores alone can reward a method that fails to announce "
        "difficult events. The capped score maps any crossing beyond H to H+1, "
        "then averages the absolute lead difference on identical cases for all methods. "
        "Cases include every pending threshold with an actual crossing OR a crossing "
        "predicted by ANY compared method within H. Cases where all methods and "
        "the observations have no crossing are omitted for all methods equally. "
        "This score includes misses and false alarms, but is only a lower bound on "
        "date error when one crossing is outside the horizon. It depends on the "
        "comparison set and must not be described as an uncensored timing MAE.",
        "",
        "Common matched MAE uses only cases observed and predicted within H by all "
        "six methods; it also compares identical cases, but excludes difficult misses.",
        "",
        "| H | Method | Capped lead MAE (days) | Common matched MAE (days) | Misses | False alarms |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    for row in overall:
        lines.append(
            f"| {row['horizon']} | {row['method']} | {row['capped_lead_mae_days']:.3f} "
            f"| {row['common_matched_mae_days']:.3f} | {row['missed_events']} "
            f"| {row['false_alarms']} |"
        )
    lines += [
        "",
        "## Method and limitations",
        "",
        "Crossing means the first daily GTS value >= TS_start; already reached "
        "thresholds are excluded. Only completely observed within-year horizons "
        "are evaluated. Prediction methods, calendar alignment and GTS calculation "
        "are reused unchanged from the original isolated analysis. The linear "
        "method's extension to 21/28 days is only a comparison baseline. A forecast "
        "value reconstructed from a signed error is rounded to nine decimal places "
        "before threshold comparison to remove floating-point cancellation noise.",
        "",
        "Historical weather determines the reference GTS crossing. No actual "
        "flowering observations are available: these errors measure threshold "
        "forecasting, not the biological accuracy of the plant thresholds. "
        "Open-Meteo reanalysis and model-blend limitations from FINDINGS.md still apply.",
        "",
        "All overall, selection (1980–2009), validation (2010 onward), recent-period, "
        "origin-month and individual-threshold scores are in metrics.csv. "
        "crossings.npz stores every included origin/threshold and all six crossing "
        "leads, with H+1 as the no-crossing sentinel. summary.json records provenance "
        "and maps thresholds to plant names. Full-period winners are descriptive; "
        "they are not independent validation of a new parameter selection rule.",
    ]
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(cache: Path, output: Path, start_year: int, end_year: int) -> list[dict]:
    """Evaluate all requested site-year-origin-threshold combinations offline."""
    manifest = cached_json(cache / "manifest.json")
    if len(manifest["locations"]) != len(manifest["files"]):
        raise ValueError("Weather manifest must pair each location with one file.")
    plants = load_thresholds()
    thresholds = np.array(sorted({item["threshold"] for item in plants}), dtype=float)
    blocks: dict[int, dict[str, list]] = {horizon: {} for horizon in HORIZONS}
    provenance = []
    for site, (location, filename) in enumerate(
        zip(manifest["locations"], manifest["files"])
    ):
        path = existing_file(cache / filename)
        provenance.append(
            {
                "file": path.name,
                "sha256": json_file_sha256(path),
                "sha256_scope": "uncompressed_file",
            }
        )
        curves = cached_gts(path)
        for year in range(start_year, end_year + 1):
            if year not in curves or any(year - j not in curves for j in range(1, 11)):
                raise ValueError(
                    f"Required target/reference year missing for {location['id']}, {year}."
                )
            curve = curves[year]
            previous = np.array(
                [
                    calendar_alignment(curves[year - j], year - j, year, len(curve))
                    for j in range(1, 11)
                ]
            )
            errors, _, _ = forecast_errors(curve, previous)
            count = len(curve) - min(HORIZONS)
            if count <= 0:
                continue
            future = np.minimum(
                np.arange(count)[:, None] + np.arange(1, 29), len(curve) - 1
            )
            actual, predicted, pending = crossing_leads(
                curve, errors[:count] + curve[future, None], thresholds
            )
            for horizon in HORIZONS:
                valid = len(curve) - horizon
                if valid <= 0:
                    continue
                observed = np.minimum(actual[:valid], horizon + 1)
                forecast = np.minimum(predicted[:valid], horizon + 1)
                relevant = pending[:valid] & (
                    (observed <= horizon) | np.any(forecast <= horizon, axis=2)
                )
                origins, targets = np.nonzero(relevant)
                fields = {
                    "site": np.full(len(origins), site, dtype=np.uint8),
                    "year": np.full(len(origins), year, dtype=np.int16),
                    "ordinal": (date(year, 1, 1).toordinal() + origins).astype(
                        np.int32
                    ),
                    "threshold_index": targets.astype(np.uint8),
                    "actual_lead": observed[origins, targets],
                    "predicted_lead": forecast[origins, targets],
                }
                for key, values in fields.items():
                    blocks[horizon].setdefault(key, []).append(values)
        message(
            "INFO",
            f"Threshold dates evaluated for {location['id']} ({site+1}/{len(manifest['locations'])}).",
        )
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    arrays = {}
    for horizon, chunks in blocks.items():
        block = {key: np.concatenate(values) for key, values in chunks.items()}
        arrays.update({f"h{horizon}_{key}": value for key, value in block.items()})
        years = block["year"]
        months = np.array(
            [date.fromordinal(int(value)).month for value in block["ordinal"]],
            dtype=np.uint8,
        )
        groups = [
            ("period", "overall", np.ones(len(years), dtype=bool)),
            ("period", "selection", years <= 2009),
            ("period", "validation", years >= 2010),
            ("period", "recent_10_years", years >= end_year - 9),
        ]
        groups.extend(
            ("threshold", str(value), block["threshold_index"] == index)
            for index, value in enumerate(thresholds)
        )
        groups.extend(("month", str(month), months == month) for month in range(1, 13))
        for group, value, mask in groups:
            rows.extend(
                {"group": group, "value": value, **row}
                for row in score(block, mask, horizon)
            )
    np.savez_compressed(output / "crossings.npz", **arrays)
    write_csv(output / "metrics.csv", rows)
    source_files = [
        ROOT / name
        for name in (
            "threshold_analysis.py",
            "thresholds_bridge.mjs",
            "analyze.py",
            "gts_bridge.mjs",
        )
    ]
    source_files += [
        ROOT.parent / "assets/js/logic.js",
        ROOT.parent / "assets/js/tracht_data.js",
    ]
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "start_year": start_year,
        "end_year": end_year,
        "archive_cutoff": manifest["end_date"],
        "locations": manifest["locations"],
        "thresholds": thresholds.tolist(),
        "plants": plants,
        "methods": METHODS,
        "source_hashes": {
            str(path.relative_to(ROOT.parent)): hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            for path in source_files
        },
        "weather_files": provenance,
        "no_crossing_sentinel": "horizon + 1",
        "overall": [
            row
            for row in rows
            if row["group"] == "period" and row["value"] == "overall"
        ],
    }
    write_json(output / "summary.json", metadata)
    build_report(rows, metadata, output / "REPORT.md")
    message("SUCCESS", f"Threshold-date results saved in {output}.")
    return rows


def main(argv: Sequence[str] | None = None) -> None:
    """Parse documented offline analysis arguments and report actionable errors."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Evaluate the complete cached experiment without API calls:\n  python prediction_analysis/threshold_analysis.py\n\nUse a separate output directory for a sensitivity run:\n  python prediction_analysis/threshold_analysis.py --start-year 2010 --output /tmp/beelot-thresholds",
    )
    parser.add_argument(
        "-h", "--help", "-?", action="help", help="Show arguments and examples."
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT / "cache",
        help="Weather cache containing manifest.json or manifest.json.gz (default: %(default)s).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "results/thresholds",
        help="Result directory (default: %(default)s).",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=1980,
        help="First target year; ten previous cached years are required (default: %(default)s).",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=2026,
        help="Last target year; only complete observed horizons are scored (default: %(default)s).",
    )
    args = parser.parse_args(argv)
    if args.start_year > args.end_year:
        parser.error("--start-year must not exceed --end-year")
    try:
        run(args.cache, args.output, args.start_year, args.end_year)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
