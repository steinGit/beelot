#!/usr/bin/env python3
"""Verify gzip cache reuse, diagnostics and compression-independent results.

The end-to-end fixture runs the real Node GTS bridge and scalar verifier with
both representations of identical JSON bytes. No network service is used.
"""

from __future__ import annotations

import contextlib
import gzip
import hashlib
import io
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import urlencode

import numpy as np

from analyze import compute_gts, run_analysis
from data import (
    ENDPOINT,
    RateBudget,
    fetch_weather,
    json_file_sha256,
    read_json,
    resolve_json_file,
    write_json,
)
from verify_results import verify


def compress(path: Path) -> Path:
    """Replace a fixture file with gzip while preserving its original bytes."""
    compressed = Path(f"{path}.gz")
    compressed.write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    path.unlink()
    return compressed


class CompressedCacheTests(unittest.TestCase):
    """Exercise every previously plain-only cache entry point."""

    def test_read_hash_write_and_explicit_path_preserve_gzip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.json"
            write_json(path, {"label": "Grünland"})
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            compressed = compress(path)
            self.assertEqual(read_json(path), read_json(compressed))
            self.assertEqual(resolve_json_file(path), compressed)
            self.assertEqual(json_file_sha256(path), expected)
            write_json(path, {"updated": True})
            self.assertFalse(path.exists())
            self.assertEqual(read_json(compressed), {"updated": True})
            explicit = Path(directory) / "new.json.gz"
            write_json(explicit, {"new": True})
            self.assertEqual(read_json(explicit), {"new": True})

    def test_corrupt_gzip_and_bad_utf8_name_the_affected_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.json.gz"
            for raw in (b"not gzip", gzip.compress(b"{}")[:-5]):
                with self.subTest(raw=raw):
                    path.write_bytes(raw)
                    with self.assertRaisesRegex(ValueError, "broken.json.gz"):
                        read_json(path)
            path.write_bytes(gzip.compress(b"\xff"))
            with self.assertRaisesRegex(ValueError, "UTF-8 JSON.*broken.json.gz"):
                read_json(path)

    def test_explicit_plain_file_takes_precedence_when_both_exist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.json"
            write_json(path, {"version": 1})
            write_json(Path(f"{path}.gz"), {"version": 2})
            self.assertEqual(read_json(path), {"version": 1})
            self.assertEqual(read_json(Path(f"{path}.gz")), {"version": 2})

    def test_downloader_reuses_compressed_weather_without_network_or_budget(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            location = {"id": "test", "latitude": 50, "longitude": 10}
            start, end = date(2026, 1, 1), date(2026, 1, 2)
            params = {
                "latitude": 50,
                "longitude": 10,
                "start_date": str(start),
                "end_date": str(end),
                "daily": "temperature_2m_mean",
                "timezone": "Europe/Berlin",
            }
            path = cache / "test_2026-01-01_2026-01-02.json"
            write_json(
                path,
                {
                    "request_url": f"{ENDPOINT}?{urlencode(params)}",
                    "response": {
                        "daily": {
                            "time": [str(start), str(end)],
                            "temperature_2m_mean": [2, 3],
                        }
                    },
                },
            )
            compressed = compress(path)
            budget = Mock(spec=RateBudget)
            with patch("data.urlopen") as network, contextlib.redirect_stdout(
                io.StringIO()
            ):
                self.assertEqual(
                    fetch_weather(location, start, end, cache, budget), compressed
                )
            network.assert_not_called()
            budget.reserve.assert_not_called()
            self.assertFalse(path.exists())

    def test_rate_budget_continues_existing_compressed_records(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            write_json(path, [[1.0, 500.0]])
            compressed = compress(path)
            with patch("data.time.time", return_value=2.0):
                RateBudget(path).reserve(20.0)
            self.assertEqual(read_json(compressed), [[1.0, 500.0], [2.0, 20.0]])
            self.assertFalse(path.exists())

    def test_plain_and_compressed_backtests_and_verification_are_identical(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache, plain, zipped = root / "cache", root / "plain", root / "gzip"
            first, last = date(1990, 1, 1), date(2001, 12, 31)
            stamps = [
                (first + timedelta(days=i)).isoformat()
                for i in range((last - first).days + 1)
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
                            "time": stamps,
                            "temperature_2m_mean": [10.0] * len(stamps),
                        },
                    },
                },
            )
            write_json(
                cache / "manifest.json",
                {
                    "start_date": str(first),
                    "end_date": str(last),
                    "locations": [location],
                    "files": ["weather.json"],
                },
            )
            write_json(cache / "batch_equivalence.json", {"fixture": True})
            with contextlib.redirect_stdout(io.StringIO()):
                before = run_analysis(cache, plain, 2000, 2001, 2000, 42)
            original_curves = compute_gts(cache / "weather.json")
            for filename in ("weather.json", "manifest.json", "batch_equivalence.json"):
                compress(cache / filename)
            np.testing.assert_array_equal(
                compute_gts(cache / "weather.json")[2000], original_curves[2000]
            )
            with contextlib.redirect_stdout(io.StringIO()):
                # Old plain-input provenance must remain valid after compression.
                self.assertTrue(verify(cache, plain, 3)["passed"])
                after = run_analysis(cache, zipped, 2000, 2001, 2000, 42)
                self.assertTrue(verify(cache, zipped, 3)["passed"])
            self.assertEqual(
                before["provenance"][0]["sha256"], after["provenance"][0]["sha256"]
            )
            self.assertEqual(after["provenance"][0]["file"], "weather.json.gz")
            self.assertEqual(after["batch_equivalence"], {"fixture": True})
            with np.load(plain / "forecast_errors.npz") as a, np.load(
                zipped / "forecast_errors.npz"
            ) as b:
                self.assertEqual(a.files, b.files)
                for key in a.files:
                    np.testing.assert_array_equal(a[key], b[key])
            self.assertEqual(
                (plain / "metrics.csv").read_bytes(),
                (zipped / "metrics.csv").read_bytes(),
            )
            self.assertFalse((cache / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
