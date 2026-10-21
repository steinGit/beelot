#!/usr/bin/env python3
"""Test offline generation of all supported empirical uncertainty settings.

Synthetic identical historical curves have known zero crossing-date errors;
the fixture also checks saved counts and output provenance.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from data import read_json, write_json
from export_uncertainty import export


class CalibrationTests(unittest.TestCase):
    """Verify supported J values and artifact generation without network access."""

    def test_export_all_histories_with_known_crossing_errors(self) -> None:
        curves = {year: np.arange(50, dtype=float) * 5 for year in range(1970, 2027)}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(
                root / "manifest.json",
                {
                    "files": ["weather.json"],
                    "locations": [{"id": "synthetic"}],
                    "end_date": "2026-02-19",
                },
            )
            write_json(root / "weather.json", {"fixture": True})
            output, report = root / "calibration.js", root / "counts.json"
            with patch("export_uncertainty.cached_gts", return_value=curves), patch(
                "export_uncertainty.load_thresholds", return_value=[{"threshold": 35}]
            ), contextlib.redirect_stdout(io.StringIO()):
                result = export(root, output, report)
            for horizon in (14, 21, 28):
                self.assertEqual(
                    set(result["maeDays"][str(horizon)]), set(map(str, range(3, 11)))
                )
                for values in result["maeDays"][str(horizon)].values():
                    self.assertEqual(values, [0.0])
            saved = read_json(report)
            self.assertEqual(saved["matched_counts"][0][0], [47 * 7])
            self.assertEqual(
                saved["output_sha256"], hashlib.sha256(output.read_bytes()).hexdigest()
            )
            self.assertIn("export const predictionCalibration", output.read_text())


if __name__ == "__main__":
    unittest.main()
