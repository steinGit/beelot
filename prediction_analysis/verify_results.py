#!/usr/bin/env python3
"""Independently verify saved backtest results using scalar calendar arithmetic.

Checks raw-input and production-source hashes, reaggregates endpoint metrics,
and reconstructs sampled daily trajectories without the vectorized predictor.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
from datetime import date, timedelta
from pathlib import Path
from typing import Sequence

import numpy as np

from analyze import compute_gts
from data import (
    ROOT,
    json_file_sha256,
    message,
    read_json,
    resolve_json_file,
    write_json,
)
from report import read_metrics


def historical_value(curves: dict, year: int, target: date) -> float:
    """Look up a month/day independently, interpolating an absent leap day."""
    if target.month == 2 and target.day == 29 and not calendar.isleap(year):
        return float((curves[year][58] + curves[year][59]) / 2)
    source = date(year, target.month, target.day)
    return float(curves[year][(source - date(year, 1, 1)).days])


def verify(cache: Path, results: Path, samples: int) -> dict:
    """Check provenance, all aggregate endpoints, and independent scalar samples."""
    summary = read_json(results / "summary.json")
    source_hash = hashlib.sha256(
        (ROOT.parent / "assets/js/logic.js").read_bytes()
    ).hexdigest()
    if source_hash != summary["gts_source_sha256"]:
        raise ValueError("BeeLot GTS source hash no longer matches the experiment.")
    for filename, expected in summary["analysis_source_sha256"].items():
        if hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Analysis source hash no longer matches: {filename}")
    curves_by_site = []
    for provenance in summary["provenance"]:
        path = resolve_json_file(cache / provenance["file"])
        if json_file_sha256(path) != provenance["sha256"]:
            raise ValueError(f"Input hash no longer matches: {path}")
        curves_by_site.append(compute_gts(path))
    archive = np.load(results / "forecast_errors.npz", allow_pickle=False)
    metrics = read_metrics(results / "metrics.csv")
    rng = np.random.default_rng(20261021)
    scalar_checks = 0
    for horizon in summary["horizons"]:
        prefix = f"h{horizon}_"
        errors = archive[prefix + "errors"]
        count = len(errors)
        if count != summary["origin_counts"][str(horizon)]:
            raise ValueError(f"Forecast count mismatch for horizon {horizon}.")
        for method_index, method in enumerate(summary["methods"]):
            row = next(
                row
                for row in metrics
                if row["group"] == "period"
                and row["value"] == "overall"
                and row["horizon"] == horizon
                and row["method"] == method
            )
            np.testing.assert_allclose(
                [
                    np.abs(errors[:, method_index]).mean(),
                    np.sqrt(np.mean(errors[:, method_index] ** 2)),
                    errors[:, method_index].mean(),
                ],
                [row["mae"], row["rmse"], row["bias"]],
                rtol=0,
                atol=1e-10,
            )
        indices = set(rng.choice(count, min(count, samples), replace=False).tolist())
        ordinals = archive[prefix + "ordinal"]
        for stamp in (
            date(2024, 1, 1),
            date(2024, 2, 28),
            date(2024, 2, 29),
            date(2024, 3, 1),
            date(2025, 12, 31) - timedelta(days=horizon),
        ):
            matches = np.flatnonzero(ordinals == stamp.toordinal())
            if len(matches):
                indices.add(int(matches[0]))
        sites = archive[prefix + "site"]
        saved_trajectory_mae = archive[prefix + "trajectory_mae"]
        saved_trajectory_mse = archive[prefix + "trajectory_mse"]
        for index in sorted(indices):
            origin = date.fromordinal(int(ordinals[index]))
            site_curves = curves_by_site[int(sites[index])]
            offset = (origin - date(origin.year, 1, 1)).days
            curve = site_curves[origin.year]
            increments = [
                float(curve[day] - curve[day - 1])
                for day in range(max(1, offset - 13), offset + 1)
            ]
            slope = sum(increments) / len(increments) if increments else 0.0
            for method_index, method in enumerate(summary["methods"]):
                daily_errors = []
                for lead in range(1, horizon + 1):
                    target = origin + timedelta(days=lead)
                    if method == "linear_14":
                        forecast = float(curve[offset]) + slope * lead
                    else:
                        history = int(method.removeprefix("history_J"))
                        deltas = [
                            historical_value(site_curves, origin.year - back, target)
                            - historical_value(site_curves, origin.year - back, origin)
                            for back in range(1, history + 1)
                        ]
                        forecast = float(curve[offset]) + sum(deltas) / history
                    daily_errors.append(forecast - float(curve[offset + lead]))
                np.testing.assert_allclose(
                    [
                        daily_errors[-1],
                        np.abs(daily_errors).mean(),
                        np.mean(np.array(daily_errors) ** 2),
                    ],
                    [
                        errors[index, method_index],
                        saved_trajectory_mae[index, method_index],
                        saved_trajectory_mse[index, method_index],
                    ],
                    rtol=1e-10,
                    atol=1e-8,
                )
                scalar_checks += 1
        message(
            "SUCCESS",
            f"Verified all aggregate scores and {len(indices)} scalar origins for {horizon} days.",
        )
    verification = {
        "passed": True,
        "input_histories": len(curves_by_site),
        "independent_method_trajectories": scalar_checks,
        "all_overall_endpoint_metrics": True,
        "boundary_cases": "January 1, leap-day transition, and last valid December origin",
        "samples_per_horizon": samples,
    }
    write_json(results / "verification.json", verification)
    return verification


def main(argv: Sequence[str] | None = None) -> int:
    """Verify a completed run without contacting any network service."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        add_help=False,
        epilog="Example: python verify_results.py --samples 200\nRecompute random trajectories and explicit calendar boundary cases independently.",
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT / "cache",
        help="Input cache matching the report (default: prediction_analysis/cache).",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=ROOT / "results",
        help="Completed analysis (default: prediction_analysis/results).",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=200,
        help="Random origins per horizon, plus calendar boundary cases (default: 200).",
    )
    args = parser.parse_args(argv)
    if args.samples < 1:
        parser.error("--samples must be positive")
    try:
        verify(args.cache_dir, args.results_dir, args.samples)
        return 0
    except (OSError, ValueError, KeyError, AssertionError, RuntimeError) as error:
        message("ERROR", str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
