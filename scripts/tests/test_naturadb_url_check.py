#!/usr/bin/env python3
"""Regression tests for the Naturadb URL checker."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "naturadb_url_check.py"
SPEC = importlib.util.spec_from_file_location("naturadb_url_check", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load URL checker: {SCRIPT_PATH}")
naturadb_url_check = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = naturadb_url_check
SPEC.loader.exec_module(naturadb_url_check)


class FakeHeaders:
    """Minimal response headers used by the URL checker."""

    @staticmethod
    def get_content_charset() -> str:
        return "utf-8"


class FakeResponse:
    """Context-managed HTTP response for URL-check tests."""

    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self.body = body
        self.headers = FakeHeaders()

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def getcode(self) -> int:
        return self.status

    def read(self) -> bytes:
        return self.body.encode("utf-8")


class ParserTests(unittest.TestCase):
    """Verify object ownership and comment handling."""

    def test_keeps_fields_in_one_object_and_ignores_comments(self) -> None:
        source = """
export const values = [
  { plant: "Without URL" },
  { plant: "Correct", url: "https://example.test/correct" },
  // { plant: "Commented", url: "https://example.test/commented" },
  /* { plant: "Also commented", url: "https://example.test/also" } */
];
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "plants.js"
            path.write_text(source, encoding="utf-8")
            entries = naturadb_url_check.parse_js_file(path)

        self.assertEqual(
            entries,
            [
                naturadb_url_check.TrachtEntry(
                    plant="Correct",
                    url="https://example.test/correct",
                    line_no=4,
                )
            ],
        )


class RequestTests(unittest.TestCase):
    """Verify response validation and process status."""

    def setUp(self) -> None:
        self.entry = naturadb_url_check.TrachtEntry(
            plant="Plant", url="https://example.test/plant", line_no=7
        )

    def test_reports_http_error_status(self) -> None:
        error = HTTPError(self.entry.url, 503, "Unavailable", {}, None)
        with patch.object(naturadb_url_check, "urlopen", side_effect=error):
            problems = naturadb_url_check.check_urls([self.entry], delay_s=0)

        self.assertEqual(problems[0].reason, "HTTP 503")

    def test_reports_error_marker(self) -> None:
        response = FakeResponse(200, "<html>Error404</html>")
        with patch.object(naturadb_url_check, "urlopen", return_value=response):
            problems = naturadb_url_check.check_urls([self.entry], delay_s=0)

        self.assertEqual(problems[0].reason, "Error404 marker found in HTML")

    def test_main_fails_when_any_url_is_problematic(self) -> None:
        with (
            patch.object(naturadb_url_check, "parse_args") as parse_args,
            patch.object(
                naturadb_url_check, "parse_js_file", return_value=[self.entry]
            ),
            patch.object(
                naturadb_url_check,
                "check_urls",
                return_value=[
                    naturadb_url_check.UrlProblem(
                        self.entry.plant,
                        self.entry.url,
                        self.entry.line_no,
                        "HTTP 404",
                    )
                ],
            ),
            patch("builtins.print"),
        ):
            parse_args.return_value.file = Path("plants.js")
            parse_args.return_value.timeout = 1.0
            parse_args.return_value.delay = 0.0
            self.assertEqual(naturadb_url_check.main([]), 1)


if __name__ == "__main__":
    unittest.main()
