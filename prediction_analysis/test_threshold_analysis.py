#!/usr/bin/env python3
"""Test threshold dates, censoring and event detection on synthetic forecasts.

These tests exercise exact equality, flat curves, misses, false alarms and
shared-case aggregation without contacting a weather service.
"""

from __future__ import annotations

import gzip
import contextlib
import io
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np

from threshold_analysis import cached_json, crossing_leads, run, score


class CrossingTests(unittest.TestCase):
    """Check crossing definitions independently using hand-derived dates."""

    def test_first_equal_day_and_no_crossing_sentinel(self) -> None:
        curve = np.array([0.0, 0.0, 10.0, 10.0, 20.0])
        forecast = np.array([[[0.0], [5.0], [10.0], [10.0]]])
        actual, predicted, pending = crossing_leads(
            curve, forecast, np.array([0.0, 10.0, 20.0, 30.0])
        )
        np.testing.assert_array_equal(actual, [[1, 2, 4, 5]])
        np.testing.assert_array_equal(predicted[:, :, 0], [[1, 3, 5, 5]])
        np.testing.assert_array_equal(pending, [[False, True, True, True]])

    def test_multiple_origins_methods_and_partial_tail(self) -> None:
        curve = np.array([0.0, 2.0, 4.0, 6.0])
        predictions = np.array(
            [
                [[2.0, 1.0], [4.0, 2.0], [6.0, 3.0]],
                [[4.0, 5.0], [6.0, 8.0], [np.nan, np.nan]],
            ]
        )
        actual, predicted, _ = crossing_leads(curve, predictions, np.array([4.0, 6.0]))
        np.testing.assert_array_equal(actual, [[2, 3], [1, 2]])
        np.testing.assert_array_equal(predicted, [[[2, 4], [3, 4]], [[1, 1], [2, 2]]])

    def test_comparison_ignores_only_floating_cancellation_noise(self) -> None:
        actual, predicted, _ = crossing_leads(
            np.array([0.0, 10.0, 20.0]),
            np.array([[[10.0 - 1e-12], [20.0]]]),
            np.array([10.0]),
        )
        self.assertEqual(int(actual[0, 0]), 1)
        self.assertEqual(int(predicted[0, 0, 0]), 1)

    def test_nonmonotone_curves_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "monotone"):
            crossing_leads(
                np.array([0.0, 10.0, 20.0]),
                np.array([[[10.0], [5.0]]]),
                np.array([8.0]),
            )

    def test_detection_and_timing_do_not_discard_misses(self) -> None:
        # H=4; lead 5 means no crossing in the forecast window.
        block = {
            "actual_lead": np.array([2, 4, 5, 3], dtype=np.uint8),
            "predicted_lead": np.array(
                [
                    [1, 2, 2, 2, 2, 2],
                    [5, 3, 3, 3, 3, 3],
                    [3, 5, 5, 5, 5, 5],
                    [4, 3, 3, 3, 3, 3],
                ],
                dtype=np.uint8,
            ),
        }
        rows = score(block, np.ones(4, dtype=bool), 4)
        first = rows[0]
        self.assertEqual(first["actual_events"], 3)
        self.assertEqual(first["matched_events"], 2)
        self.assertEqual(first["missed_events"], 1)
        self.assertEqual(first["false_alarms"], 1)
        self.assertAlmostEqual(first["recall"], 2 / 3)
        self.assertAlmostEqual(first["precision"], 2 / 3)
        self.assertEqual(first["matched_mae_days"], 1.0)
        self.assertEqual(first["matched_bias_days"], 0.0)
        self.assertEqual(first["capped_lead_mae_days"], 1.25)
        self.assertEqual(first["common_matched_events"], 2)
        self.assertEqual(first["common_matched_mae_days"], 1.0)
        self.assertEqual(rows[1]["common_matched_events"], 2)
        self.assertEqual(rows[1]["common_matched_mae_days"], 0.0)

    def test_no_matches_and_empty_groups(self) -> None:
        block = {
            "actual_lead": np.array([1]),
            "predicted_lead": np.full((1, 6), 5),
        }
        rows = score(block, np.array([True]), 4)
        self.assertIsNone(rows[0]["matched_mae_days"])
        self.assertIsNone(rows[0]["precision"])
        self.assertEqual(rows[0]["recall"], 0.0)
        self.assertEqual(score(block, np.array([False]), 4), [])

    def test_compressed_json_and_malformed_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            with gzip.open(f"{path}.gz", "wt", encoding="utf-8") as stream:
                stream.write('{"test": 1}')
            self.assertEqual(cached_json(path), {"test": 1})
            with gzip.open(f"{path}.gz", "wt", encoding="utf-8") as stream:
                stream.write('{\n"test": }')
            with self.assertRaisesRegex(ValueError, "manifest.json.gz, line 2, column"):
                cached_json(path)
            with self.assertRaisesRegex(FileNotFoundError, "missing.json"):
                cached_json(Path(directory) / "missing.json")

    def test_complete_offline_pipeline_from_compressed_weather(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            output = cache / "results"
            first, last = date(1991, 1, 1), date(2001, 12, 31)
            dates = [
                (first + timedelta(days=index)).isoformat()
                for index in range((last - first).days + 1)
            ]
            weather = {
                "response": {
                    "daily": {"time": dates, "temperature_2m_mean": [10.0] * len(dates)}
                }
            }
            manifest = {
                "locations": [{"id": "synthetic", "country": "DEU"}],
                "files": ["weather.json"],
                "end_date": last.isoformat(),
            }
            for name, payload in (("weather", weather), ("manifest", manifest)):
                with gzip.open(
                    cache / f"{name}.json.gz", "wt", encoding="utf-8"
                ) as stream:
                    json.dump(payload, stream)
            plants = [{"plant": "Synthetic", "threshold": 35}]
            with patch(
                "threshold_analysis.load_thresholds", return_value=plants
            ), contextlib.redirect_stdout(io.StringIO()):
                rows = run(cache, output, 2001, 2001)
            overall = [
                row
                for row in rows
                if row["group"] == "period" and row["value"] == "overall"
            ]
            self.assertEqual(len(overall), 18)
            self.assertEqual(overall[0]["matched_events"], 6)
            self.assertEqual(overall[0]["matched_mae_days"], 0.0)
            self.assertEqual(overall[5]["missed_events"], 1)
            self.assertEqual(overall[5]["recall"], 5 / 6)
            with np.load(output / "crossings.npz", allow_pickle=False) as archive:
                self.assertEqual(archive["h14_predicted_lead"].shape, (6, 6))
                np.testing.assert_array_equal(
                    archive["h14_actual_lead"], [6, 5, 4, 3, 2, 1]
                )
            self.assertIn("lower bound", (output / "REPORT.md").read_text())


if __name__ == "__main__":
    unittest.main()
