#!/usr/bin/env python3
"""Check Naturadb URLs from a JS data file for Error404 pages.

This script reads a JavaScript file containing a defaultTrachtData array,
extracts all URLs, fetches them, and reports entries whose pages contain
the marker text "Error404" or could not be fetched.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Iterable, List, Optional

import requests


@dataclass(frozen=True)
class TrachtEntry:
    """Single parsed entry from the JS file."""

    plant: str
    url: str
    line_no: int


@dataclass(frozen=True)
class UrlProblem:
    """Description of a problematic URL."""

    plant: str
    url: str
    line_no: int
    reason: str


_URL_REGEX = re.compile(
    r"""
    plant:\s*"(?P<plant>[^"]+)"      # plant name
    .*?
    url:\s*"(?P<url>https?://[^"]+)" # url
    """,
    re.VERBOSE | re.DOTALL,
)


def parse_js_file(path: str) -> List[TrachtEntry]:
    """Parse a JS file and extract plant + url entries.

    Parameters
    ----------
    path:
        Path to the JavaScript file.

    Returns
    -------
    List of TrachtEntry objects.
    """
    entries: List[TrachtEntry] = []

    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    text = "".join(lines)

    for match in _URL_REGEX.finditer(text):
        start_pos = match.start()
        line_no = text[:start_pos].count("\n") + 1

        entries.append(
            TrachtEntry(
                plant=match.group("plant"),
                url=match.group("url"),
                line_no=line_no,
            )
        )

    return entries


def check_urls(
    entries: Iterable[TrachtEntry],
    timeout_s: float = 15.0,
    delay_s: float = 0.3,
) -> List[UrlProblem]:
    """Fetch URLs and detect Naturadb Error404 pages.

    Parameters
    ----------
    entries:
        Parsed TrachtEntry objects.
    timeout_s:
        Per-request timeout in seconds.
    delay_s:
        Delay between requests to reduce blocking.

    Returns
    -------
    List of UrlProblem objects.
    """
    problems: List[UrlProblem] = []

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        }
    )

    for entry in entries:
        try:
            response = session.get(
                entry.url,
                timeout=timeout_s,
                allow_redirects=True,
            )
        except requests.RequestException as exc:
            problems.append(
                UrlProblem(
                    plant=entry.plant,
                    url=entry.url,
                    line_no=entry.line_no,
                    reason=f"request failed: {exc}",
                )
            )
            time.sleep(delay_s)
            continue

        try:
            response.encoding = response.encoding or "utf-8"
            html = response.text
        except Exception as exc:
            problems.append(
                UrlProblem(
                    plant=entry.plant,
                    url=entry.url,
                    line_no=entry.line_no,
                    reason=f"decode failed: {exc}",
                )
            )
            time.sleep(delay_s)
            continue

        if "Error404" in html:
            problems.append(
                UrlProblem(
                    plant=entry.plant,
                    url=entry.url,
                    line_no=entry.line_no,
                    reason="Error404 marker found in HTML",
                )
            )

        time.sleep(delay_s)

    return problems


def main() -> int:
    import sys

    if len(sys.argv) != 2:
        print("Usage: python check_naturadb_urls_from_js.py <tracht_data.js>")
        return 1

    js_path = sys.argv[1]

    entries = parse_js_file(js_path)
    problems = check_urls(entries)

    if not problems:
        print("No problematic URLs found.")
        return 0

    print("Problematic URLs (Error404 or fetch problems):\n")
    for p in problems:
        print(
            f"- line {p.line_no}: "
            f'plant="{p.plant}", '
            f"url={p.url}\n"
            f"  reason: {p.reason}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
