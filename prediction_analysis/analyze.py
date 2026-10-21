#!/usr/bin/env python3
"""Backtest historical-average GTS predictions against BeeLot's linear baseline.

Every forecast uses only earlier calendar years. All GTS values come directly
from the unchanged JavaScript implementation through a small Node bridge.
"""

from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import json
import os
import platform
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Final, Sequence

import numpy as np
from numpy.typing import NDArray

from data import (
    ROOT,
    find_json_file,
    json_file_sha256,
    message,
    read_json,
    resolve_json_file,
    validate_daily,
    write_json,
)

HORIZONS: Final = (14, 21, 28)
HISTORY_YEARS: Final = (1, 2, 5, 7, 10)
METHODS: Final = tuple(f"history_J{years}" for years in HISTORY_YEARS) + ("linear_14",)
FloatArray = NDArray[np.float64]


def calendar_alignment(
    reference: FloatArray, reference_year: int, target_year: int, count: int
) -> FloatArray:
    """Align historical GTS to target month/day, interpolating missing February 29.

    This is calendar alignment for the proposed predictor, independently of the
    intentional day-index alignment in BeeLot's historical chart display.
    """
    aligned = np.empty(count)
    for index in range(count):
        stamp = date(target_year, 1, 1) + timedelta(days=index)
        if stamp.month == 2 and stamp.day == 29 and not calendar.isleap(reference_year):
            aligned[index] = (reference[58] + reference[59]) / 2
        else:
            source_date = date(reference_year, stamp.month, stamp.day)
            aligned[index] = reference[(source_date - date(reference_year, 1, 1)).days]
    return aligned


def forecast_errors(
    curve: FloatArray, previous: FloatArray, horizon: int = 28
) -> tuple[FloatArray, FloatArray, FloatArray]:
    """Compute daily errors plus cumulative absolute/squared trajectory errors.

    The six methods are J=1,2,5,7,10 and the existing fourteen-day linear slope.
    Rows without a complete within-year target remain NaN.
    """
    count = len(curve)
    errors = np.full((count, horizon, len(METHODS)), np.nan)
    indices = np.arange(count)
    lookback = np.minimum(14, indices)
    slopes = np.divide(
        curve - curve[indices - lookback],
        lookback,
        out=np.zeros(count),
        where=lookback > 0,
    )
    for lead in range(1, min(horizon, count - 1) + 1):
        valid = count - lead
        deltas = previous[:, lead:] - previous[:, :valid]
        cumulative = np.cumsum(deltas, axis=0)
        predictions = (
            cumulative[np.array(HISTORY_YEARS) - 1] / np.array(HISTORY_YEARS)[:, None]
        ).T
        actual = curve[lead:] - curve[:valid]
        errors[:valid, lead - 1, :5] = predictions - actual[:, None]
        errors[:valid, lead - 1, 5] = lead * slopes[:valid] - actual
    return errors, np.cumsum(np.abs(errors), axis=1), np.cumsum(errors**2, axis=1)


def compute_gts(path: Path) -> dict[int, FloatArray]:
    """Run the exact production GTS function, resetting at each January 1."""
    path = resolve_json_file(path)
    read_json(path)  # Validate with the original path and JSON line/column diagnostics.
    command = ["node", str(ROOT / "gts_bridge.mjs"), str(path)]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
        env={**os.environ, "TZ": "Europe/Berlin"},
    )
    if result.returncode:
        raise RuntimeError(
            f"Production GTS bridge failed for {path}: {result.stderr.strip()}"
        )
    values = json.loads(result.stdout)
    return {
        int(year): np.array(curve, dtype=np.float64) for year, curve in values.items()
    }


def metric_rows(
    block: dict[str, NDArray],
    mask: NDArray[np.bool_],
    horizon: int,
    group: str,
    value: str,
) -> list[dict]:
    """Compute endpoint and complete-trajectory scores on identical forecast origins."""
    errors = block["errors"][mask]
    if not len(errors):
        return []
    rows = []
    for index, method in enumerate(METHODS):
        selected = errors[:, index]
        absolute = np.abs(selected)
        rows.append(
            {
                "group": group,
                "value": value,
                "horizon": horizon,
                "method": method,
                "J": HISTORY_YEARS[index] if index < 5 else "",
                "count": len(selected),
                "mae": float(absolute.mean()),
                "rmse": float(np.sqrt(np.mean(selected**2))),
                "bias": float(selected.mean()),
                "median_absolute_error": float(np.median(absolute)),
                "p90_absolute_error": float(np.quantile(absolute, 0.9)),
                "p95_absolute_error": float(np.quantile(absolute, 0.95)),
                "trajectory_mae": float(block["trajectory_mae"][mask, index].mean()),
                "trajectory_rmse": float(
                    np.sqrt(block["trajectory_mse"][mask, index].mean())
                ),
            }
        )
    return rows


def write_csv(path: Path, rows: list[dict]) -> None:
    """Write a UTF-8 table with stable column order and no spreadsheet formulas."""
    if not rows:
        raise ValueError(f"Cannot write an empty result table: {path}")
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def summarize(
    blocks: dict[int, dict[str, NDArray]],
    locations: list[dict],
    start_year: int,
    end_year: int,
    selection_end_year: int,
) -> list[dict]:
    """Create overall, chronological, country, location, month and seasonal views."""
    rows = []
    for horizon, block in blocks.items():
        years, months, site = block["year"], block["month"], block["site"]
        groups = [
            ("period", "overall", np.ones(len(years), dtype=bool)),
            ("period", "selection", years <= selection_end_year),
            ("period", "validation", years > selection_end_year),
            ("period", "recent_10_years", years >= end_year - 9),
            ("season", "January-June", months <= 6),
            ("season", "February-June", (months >= 2) & (months <= 6)),
        ]
        groups.extend(
            ("year", str(year), years == year)
            for year in range(start_year, end_year + 1)
        )
        groups.extend(("month", str(month), months == month) for month in range(1, 13))
        groups.extend(
            ("location", location["id"], site == index)
            for index, location in enumerate(locations)
        )
        for country in ("DEU", "AUT", "CHE"):
            indices = [
                index
                for index, location in enumerate(locations)
                if location["country"] == country
            ]
            groups.append(("country", country, np.isin(site, indices)))
        for group, value, mask in groups:
            rows.extend(metric_rows(block, mask, horizon, group, value))
    return rows


def paired_year_bootstrap(
    block: dict[str, NDArray], best_index: int, other_index: int, seed: int
) -> dict:
    """Use paired whole-year blocks, preserving overlapping origins and all sites."""
    differences = np.abs(block["errors"][:, best_index]) - np.abs(
        block["errors"][:, other_index]
    )
    yearly_sums = []
    yearly_counts = []
    for year in np.unique(block["year"]):
        selected = differences[block["year"] == year]
        yearly_sums.append(selected.sum())
        yearly_counts.append(len(selected))
    rng = np.random.default_rng(seed)
    sampled = rng.integers(0, len(yearly_sums), size=(2000, len(yearly_sums)))
    replicates = np.array(yearly_sums)[sampled].sum(axis=1) / np.array(yearly_counts)[
        sampled
    ].sum(axis=1)
    return {
        "difference_mae": float(differences.mean()),
        "lower_95": float(np.quantile(replicates, 0.025)),
        "upper_95": float(np.quantile(replicates, 0.975)),
        "blocks": len(yearly_sums),
        "resamples": len(replicates),
    }


def recommendations(
    rows: list[dict], blocks: dict[int, dict[str, NDArray]], seed: int
) -> list[dict]:
    """Rank historical windows and evaluate a frozen training-period selection."""
    results = []
    for horizon in HORIZONS:
        subset = [
            row
            for row in rows
            if row["horizon"] == horizon and row["group"] == "period"
        ]
        overall = sorted(
            (row for row in subset if row["value"] == "overall" and row["J"] != ""),
            key=lambda row: row["mae"],
        )
        selection = min(
            (row for row in subset if row["value"] == "selection" and row["J"] != ""),
            key=lambda row: row["mae"],
        )
        validation = [row for row in subset if row["value"] == "validation"]
        chosen = next(row for row in validation if row["method"] == selection["method"])
        baseline = next(
            row
            for row in subset
            if row["value"] == "overall" and row["method"] == "linear_14"
        )
        validation_baseline = next(
            row for row in validation if row["method"] == "linear_14"
        )
        best_index = METHODS.index(overall[0]["method"])
        results.append(
            {
                "horizon": horizon,
                "best_overall_J": overall[0]["J"],
                "ranking": overall,
                "linear_baseline": baseline,
                "improvement_vs_linear_percent": (
                    100 * (1 - overall[0]["mae"] / baseline["mae"])
                    if baseline["mae"]
                    else None
                ),
                "selected_on_training_J": selection["J"],
                "frozen_validation": chosen,
                "validation_linear_baseline": validation_baseline,
                "bootstrap_vs_runner_up": paired_year_bootstrap(
                    blocks[horizon],
                    best_index,
                    METHODS.index(overall[1]["method"]),
                    seed + horizon,
                ),
                "bootstrap_vs_linear": paired_year_bootstrap(
                    blocks[horizon], best_index, 5, seed + horizon
                ),
            }
        )
    return results


def write_oracle(
    path: Path, blocks: dict[int, dict[str, NDArray]], locations: list[dict]
) -> None:
    """Save hindsight best-J diagnostics, explicitly unsuitable as a predictor."""
    import gzip

    with gzip.open(path, "wt", encoding="utf-8", newline="", compresslevel=3) as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "location",
                "origin",
                "horizon",
                "hindsight_best_J",
                "best_absolute_error",
                "tie_count",
            ]
        )
        for horizon, block in blocks.items():
            absolute = np.abs(block["errors"][:, :5])
            best = absolute.argmin(axis=1)
            minima = absolute.min(axis=1)
            ties = np.isclose(absolute, minima[:, None], rtol=0, atol=1e-9).sum(axis=1)
            writer.writerows(
                (
                    locations[int(site)]["id"],
                    date.fromordinal(int(stamp)).isoformat(),
                    horizon,
                    HISTORY_YEARS[int(index)],
                    f"{error:.6f}",
                    int(tie_count),
                )
                for site, stamp, index, error, tie_count in zip(
                    block["site"], block["ordinal"], best, minima, ties
                )
            )


def run_analysis(
    cache_dir: Path,
    output_dir: Path,
    start_year: int,
    end_year: int,
    selection_end_year: int,
    seed: int,
) -> dict:
    """Run every site-year-origin and persist auditable scores and provenance."""
    manifest = read_json(cache_dir / "manifest.json")
    locations = manifest["locations"]
    if len(locations) != len(manifest["files"]):
        raise ValueError("Weather manifest must pair every location with one file.")
    manifest_start = date.fromisoformat(manifest["start_date"])
    manifest_end = date.fromisoformat(manifest["end_date"])
    if (
        manifest_start > date(start_year - max(HISTORY_YEARS), 1, 1)
        or manifest_end.year < end_year
    ):
        raise ValueError(
            "Weather manifest does not cover the requested backtest plus ten previous years."
        )
    blocks: dict[int, dict[str, list]] = {horizon: {} for horizon in HORIZONS}
    provenance = []
    for site_index, (location, filename) in enumerate(
        zip(locations, manifest["files"])
    ):
        path = resolve_json_file(cache_dir / filename)
        cached = read_json(path)
        validate_daily(cached["response"], manifest_start, manifest_end, str(path))
        curves = compute_gts(path)
        provenance.append(
            {
                "site": location["id"],
                "file": path.name,
                "sha256": json_file_sha256(path),
                "sha256_scope": "uncompressed_file",
                "request_url": cached["request_url"],
                "downloaded_at": cached["downloaded_at"],
                "api_grid_latitude": cached["response"]["latitude"],
                "api_grid_longitude": cached["response"]["longitude"],
                "elevation": cached["response"].get("elevation"),
            }
        )
        for year in range(start_year, end_year + 1):
            curve = curves[year]
            previous = np.stack(
                [
                    calendar_alignment(
                        curves[year - offset], year - offset, year, len(curve)
                    )
                    for offset in range(1, max(HISTORY_YEARS) + 1)
                ]
            )
            errors, absolute_sum, squared_sum = forecast_errors(curve, previous)
            dates = [
                date(year, 1, 1) + timedelta(days=index) for index in range(len(curve))
            ]
            for horizon in HORIZONS:
                count = len(curve) - horizon
                if count <= 0:
                    continue
                # Copy the endpoint so retained views do not pin all 28 lead days.
                endpoint = errors[:count, horizon - 1, :].copy()
                if not np.isfinite(endpoint).all():
                    raise ValueError(
                        f"Non-finite backtest error for {location['id']} in {year}."
                    )
                values = {
                    "site": np.full(count, site_index, dtype=np.int32),
                    "year": np.full(count, year, dtype=np.int16),
                    "month": np.array(
                        [stamp.month for stamp in dates[:count]], dtype=np.uint8
                    ),
                    "ordinal": np.array(
                        [stamp.toordinal() for stamp in dates[:count]], dtype=np.int32
                    ),
                    "gts_origin": curve[:count],
                    "gts_actual": curve[horizon:],
                    "errors": endpoint,
                    "trajectory_mae": absolute_sum[:count, horizon - 1, :] / horizon,
                    "trajectory_mse": squared_sum[:count, horizon - 1, :] / horizon,
                }
                for name, value in values.items():
                    blocks[horizon].setdefault(name, []).append(value)
        message(
            "INFO", f"Evaluated {site_index + 1}/{len(locations)}: {location['id']}"
        )
    merged = {
        horizon: {name: np.concatenate(parts, axis=0) for name, parts in block.items()}
        for horizon, block in blocks.items()
    }
    blocks.clear()
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = summarize(merged, locations, start_year, end_year, selection_end_year)
    write_csv(output_dir / "metrics.csv", rows)
    best = recommendations(rows, merged, seed)
    write_csv(
        output_dir / "ranking.csv",
        [row for row in rows if row["group"] == "period" and row["value"] == "overall"],
    )
    # Exact float64 errors retain enough precision to reconstruct every endpoint.
    np.savez_compressed(
        output_dir / "forecast_errors.npz",
        **{
            f"h{horizon}_{name}": value
            for horizon, block in merged.items()
            for name, value in block.items()
        },
    )
    write_oracle(output_dir / "hindsight_best_J.csv.gz", merged, locations)
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "start_year": start_year,
        "end_year": end_year,
        "selection_end_year": selection_end_year,
        "archive_end_date": manifest["end_date"],
        "locations": locations,
        "seed": seed,
        "sampling_seed": read_json(ROOT / "locations.json")["seed"],
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "node": subprocess.run(
                ["node", "--version"],
                capture_output=True,
                text=True,
                check=True,
                timeout=10,
            ).stdout.strip(),
        },
        "archive_model": "BeeLot default archive_best_match; ERA5/ERA5-Land/IFS blend, not explicitly pinned to one model",
        "analysis_source_sha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in ("analyze.py", "data.py", "gts_bridge.mjs")
        },
        "horizons": HORIZONS,
        "history_years": HISTORY_YEARS,
        "methods": METHODS,
        "origin_counts": {
            str(horizon): len(block["year"]) for horizon, block in merged.items()
        },
        "method_endpoint_predictions": sum(
            len(block["year"]) * len(METHODS) for block in merged.values()
        ),
        "method_daily_predictions": sum(
            len(block["year"]) * len(METHODS) * horizon
            for horizon, block in merged.items()
        ),
        "gts_source_sha256": hashlib.sha256(
            (ROOT.parent / "assets/js/logic.js").read_bytes()
        ).hexdigest(),
        "reference_alignment": "same calendar month/day; February 29 interpolated between February 28 and March 1 in non-leap reference years",
        "year_boundary": "only complete horizons within the origin calendar year",
        "baseline": "BeeLot slope = (GTS[t] - GTS[max(0,t-14)]) / min(t,14); zero on January 1; extended unchanged to 21/28 days for comparison",
        "provenance": provenance,
        "batch_equivalence": (
            read_json(cache_dir / "batch_equivalence.json")
            if find_json_file(cache_dir / "batch_equivalence.json")
            else None
        ),
        "recommendations": best,
    }
    write_json(output_dir / "summary.json", metadata)
    message(
        "SUCCESS",
        f"Completed {metadata['method_endpoint_predictions']:,} endpoint predictions.",
    )
    return metadata


def main(argv: Sequence[str] | None = None) -> int:
    """Parse backtest settings and run the numerical analysis."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n  python analyze.py\n    Evaluate all cached locations for 1980 through 2026.\n  python analyze.py --start-year 2010 --selection-end-year 2018\n    Repeat a smaller chronological split without new downloads.",
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT / "cache",
        help="Validated input cache (default: prediction_analysis/cache).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "results",
        help="Result directory (default: prediction_analysis/results).",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=1980,
        help="First evaluated year, inclusive (default: 1980).",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=2026,
        help="Last evaluated year, inclusive (default: 2026).",
    )
    parser.add_argument(
        "--selection-end-year",
        type=int,
        default=2009,
        help="Last parameter-selection year; subsequent years are held out (default: 2009).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20261020,
        help="Year-block bootstrap seed (default: 20261020).",
    )
    args = parser.parse_args(argv)
    if not 1950 <= args.start_year <= args.selection_end_year < args.end_year:
        parser.error("Require 1950 <= start year <= selection end year < end year.")
    try:
        run_analysis(
            args.cache_dir,
            args.output_dir,
            args.start_year,
            args.end_year,
            args.selection_end_year,
            args.seed,
        )
        return 0
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        message("ERROR", str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
