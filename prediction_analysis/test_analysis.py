#!/usr/bin/env python3
"""Regression tests for data boundaries, calendar alignment and forecast scoring.

Tests use synthetic weather data and the real BeeLot GTS implementation; no
external service is contacted.
"""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np

from analyze import (
    HISTORY_YEARS,
    calendar_alignment,
    compute_gts,
    forecast_errors,
    metric_rows,
    run_analysis,
)
from data import (
    ROOT,
    RateBudget,
    inside_country,
    read_json,
    sample_locations,
    validate_daily,
    write_json,
)
from report import build_report, read_metrics


class ForecastTests(unittest.TestCase):
    """Verify the requested formula independently with hand-computed results."""

    def test_subtracts_anchor_before_averaging_previous_years(self) -> None:
        curve = np.array([100.0, 104.0, 109.0, 115.0])
        previous = np.array(
            [
                [
                    1000 * year,
                    1000 * year + year,
                    1000 * year + 3 * year,
                    1000 * year + 6 * year,
                ]
                for year in range(1, 11)
            ]
        )
        errors, absolute, squared = forecast_errors(curve, previous, horizon=2)
        for method_index, history in enumerate(HISTORY_YEARS):
            mean_year = (history + 1) / 2
            self.assertAlmostEqual(errors[0, 1, method_index], 3 * mean_year - 9)
            self.assertAlmostEqual(errors[1, 0, method_index], 2 * mean_year - 5)
        np.testing.assert_allclose(absolute[0, 1], np.abs(errors[0, :2]).sum(axis=0))
        np.testing.assert_allclose(squared[0, 1], (errors[0, :2] ** 2).sum(axis=0))

    def test_linear_baseline_uses_past_fourteen_increments_only(self) -> None:
        curve = np.arange(40, dtype=float) ** 2
        previous = np.tile(curve, (10, 1))
        errors, _, _ = forecast_errors(curve, previous)
        expected_slope = (curve[20] - curve[6]) / 14
        self.assertAlmostEqual(
            errors[20, 6, 5], expected_slope * 7 - (curve[27] - curve[20])
        )
        self.assertAlmostEqual(errors[0, 0, 5], -(curve[1] - curve[0]))
        self.assertTrue(np.isnan(errors[-1]).all())

    def test_historical_predictor_uses_only_selected_previous_years(self) -> None:
        curve = np.arange(35, dtype=float)
        previous = np.tile(curve, (10, 1))
        original, _, _ = forecast_errors(curve, previous)
        changed = previous.copy()
        changed[2:] *= 100
        updated, _, _ = forecast_errors(curve, changed)
        np.testing.assert_allclose(
            original[:, :, :2], updated[:, :, :2], equal_nan=True
        )
        self.assertGreater(updated[0, 0, 4], original[0, 0, 4])

    def test_calendar_alignment_does_not_shift_march_after_leap_day(self) -> None:
        non_leap = np.arange(365, dtype=float)
        aligned = calendar_alignment(non_leap, 2023, 2024, 366)
        self.assertEqual(aligned[58], 58)
        self.assertEqual(aligned[59], 58.5)
        self.assertEqual(aligned[60], 59)
        self.assertEqual(aligned[-1], 364)

    def test_non_leap_target_skips_historical_february_29(self) -> None:
        leap = np.arange(366, dtype=float)
        aligned = calendar_alignment(leap, 2024, 2025, 365)
        self.assertEqual(aligned[58], 58)
        self.assertEqual(aligned[59], 60)
        self.assertEqual(aligned[-1], 365)

    def test_metrics_include_signed_bias_and_trajectory_scores(self) -> None:
        errors = np.tile(np.array([[-2.0], [4.0]]), (1, 6))
        block = {
            "errors": errors,
            "trajectory_mae": np.ones((2, 6)),
            "trajectory_mse": np.full((2, 6), 4.0),
        }
        rows = metric_rows(block, np.array([True, True]), 14, "period", "test")
        self.assertEqual(rows[0]["mae"], 3.0)
        self.assertEqual(rows[0]["bias"], 1.0)
        self.assertAlmostEqual(rows[0]["rmse"], np.sqrt(10))
        self.assertEqual(rows[0]["trajectory_mae"], 1.0)
        self.assertEqual(rows[0]["trajectory_rmse"], 2.0)


class DataTests(unittest.TestCase):
    """Verify reproducible sampling, input validation and offline operation."""

    def test_country_containment_excludes_polygon_holes(self) -> None:
        geometry = {
            "type": "Polygon",
            "coordinates": [
                [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
                [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
            ],
        }
        self.assertTrue(inside_country(0.5, 0.5, geometry))
        self.assertFalse(inside_country(1.5, 1.5, geometry))
        self.assertFalse(inside_country(5, 5, geometry))

    def test_sample_is_reproducible_and_all_rounded_points_are_in_dach(self) -> None:
        source = read_json(ROOT / "boundaries.geojson")
        boundaries = {
            f["properties"]["country"]: f["geometry"] for f in source["features"]
        }
        first = sample_locations(boundaries, 40, 20261020)
        second = sample_locations(boundaries, 40, 20261020)
        self.assertEqual(first, second)
        self.assertEqual(
            {location["country"] for location in first}, {"DEU", "AUT", "CHE"}
        )
        for location in first:
            self.assertTrue(
                inside_country(
                    location["longitude"],
                    location["latitude"],
                    boundaries[location["country"]],
                )
            )

    def test_rejects_null_values_and_missing_dates(self) -> None:
        payload = {
            "daily": {
                "time": ["2026-01-01", "2026-01-02"],
                "temperature_2m_mean": [2.0, None],
            }
        }
        with self.assertRaisesRegex(ValueError, "2026-01-02"):
            validate_daily(payload, date(2026, 1, 1), date(2026, 1, 2), "test.json")
        payload["daily"]["temperature_2m_mean"] = [2.0, 0.0]
        validate_daily(payload, date(2026, 1, 1), date(2026, 1, 2), "test.json")
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            validate_daily(payload, date(2026, 1, 1), date(2026, 1, 3), "test.json")

    def test_json_errors_name_path_line_and_column(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.json"
            path.write_text('{\n"value":\n}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"broken.json, line 3, column 1"):
                read_json(path)

    def test_weighted_minute_budget_waits_before_reservation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            write_json(path, [[1.0, 500.0]])
            with patch("data.time.time", side_effect=[2.0, 64.0]), patch(
                "data.time.sleep"
            ) as sleep, contextlib.redirect_stdout(io.StringIO()):
                RateBudget(path).reserve(100.0)
            sleep.assert_called_once()
            self.assertEqual(read_json(path)[-1], [64.0, 100.0])

    def test_real_beelot_gts_weights_rounding_and_year_reset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weather.json"
            write_json(
                path,
                {
                    "response": {
                        "daily": {
                            "time": [
                                "2023-12-31",
                                "2024-01-01",
                                "2024-02-01",
                                "2024-03-01",
                                "2024-03-02",
                            ],
                            "temperature_2m_mean": [10.0, 10.0, 10.0, 10.0, -5.0],
                        }
                    }
                },
            )
            values = compute_gts(path)
            np.testing.assert_array_equal(values[2023], [10.0])
            np.testing.assert_array_equal(values[2024], [5.0, 12.5, 22.5, 22.5])


class EndToEndTests(unittest.TestCase):
    """Exercise the real cache-to-metrics pipeline using complete synthetic years."""

    def test_offline_pipeline_counts_full_horizons_and_writes_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            output = Path(directory) / "results"
            first, last = date(1990, 1, 1), date(2001, 12, 31)
            dates = [
                (first + timedelta(days=index)).isoformat()
                for index in range((last - first).days + 1)
            ]
            location = {
                "id": "synthetic",
                "country": "DEU",
                "latitude": 50.0,
                "longitude": 10.0,
            }
            write_json(
                cache / "weather.json",
                {
                    "request_url": "https://example.invalid/offline-fixture",
                    "downloaded_at": "2002-01-01",
                    "response": {
                        "latitude": 50.0,
                        "longitude": 10.0,
                        "daily": {
                            "time": dates,
                            "temperature_2m_mean": [10.0] * len(dates),
                        },
                    },
                },
            )
            write_json(
                cache / "manifest.json",
                {
                    "locations": [location],
                    "files": ["weather.json"],
                    "start_date": first.isoformat(),
                    "end_date": last.isoformat(),
                },
            )
            with contextlib.redirect_stdout(io.StringIO()):
                summary = run_analysis(cache, output, 2000, 2001, 2000, 42)
            self.assertEqual(summary["origin_counts"]["14"], 366 + 365 - 28)
            self.assertEqual(summary["origin_counts"]["28"], 366 + 365 - 56)
            self.assertEqual(len(summary["recommendations"]), 3)
            archive = np.load(output / "forecast_errors.npz", allow_pickle=False)
            self.assertEqual(archive["h14_errors"].shape[1], 6)
            self.assertTrue((output / "hindsight_best_J.csv.gz").is_file())
            self.assertTrue((output / "metrics.csv").is_file())
            self.assertEqual(read_json(output / "summary.json")["start_year"], 2000)
            build_report(summary, read_metrics(output / "metrics.csv"), output)
            self.assertIn("Recommended parameters", (output / "REPORT.md").read_text())


if __name__ == "__main__":
    unittest.main()
