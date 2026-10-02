#!/usr/bin/env python3
"""Validate Naturadb links declared in a JavaScript plant-data file.

The parser keeps plant names and URLs within the same object, ignores commented
code, and checks both HTTP status and the site's Error404 marker. Only Python's
standard library is required.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Iterable, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ANSI_ERROR: Final[str] = "\033[31m"
ANSI_INFO: Final[str] = "\033[36m"
ANSI_SUCCESS: Final[str] = "\033[32m"
ANSI_RESET: Final[str] = "\033[0m"
DEFAULT_INPUT: Final[Path] = Path("assets/js/tracht_data.js")
STRING_PATTERN: Final[str] = r'"(?P<value>(?:\\.|[^"\\])*)"'


@dataclass(frozen=True)
class TrachtEntry:
    """Single plant link parsed from a JavaScript object."""

    plant: str
    url: str
    line_no: int


@dataclass(frozen=True)
class UrlProblem:
    """Description of a plant link that could not be validated."""

    plant: str
    url: str
    line_no: int
    reason: str


def print_error(message: str) -> None:
    """Print a categorized error message."""
    print(f"{ANSI_ERROR}ERROR: {message}{ANSI_RESET}", file=sys.stderr)


def print_info(message: str) -> None:
    """Print a categorized informational message."""
    print(f"{ANSI_INFO}INFO: {message}{ANSI_RESET}")


def print_success(message: str) -> None:
    """Print a categorized success message."""
    print(f"{ANSI_SUCCESS}SUCCESS: {message}{ANSI_RESET}")


def usage() -> str:
    """Return command usage with practical examples."""
    return (
        "naturadb_url_check.py [OPTIONS] [FILE]\n\n"
        "Examples:\n"
        "  ./scripts/naturadb_url_check.py\n"
        "      Check the default assets/js/tracht_data.js file.\n"
        "  ./scripts/naturadb_url_check.py data/plants.js --delay 0\n"
        "      Check another file without pausing between requests.\n"
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Check Naturadb plant links declared in JavaScript data.",
        usage=usage(),
        add_help=False,
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "file",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"JavaScript data file (default: {DEFAULT_INPUT}).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Per-request timeout in seconds (default: 15).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.3,
        help="Delay between requests in seconds (default: 0.3).",
    )
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
    if args.delay < 0:
        parser.error("--delay must not be negative")
    return args


def strip_js_comments(source: str) -> str:
    """Replace JavaScript comments with spaces while preserving line numbers."""
    output: list[str] = []
    index = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False

    while index < len(source):
        char = source[index]
        following = source[index + 1] if index + 1 < len(source) else ""

        if line_comment:
            if char == "\n":
                line_comment = False
                output.append(char)
            else:
                output.append(" ")
            index += 1
            continue
        if block_comment:
            if char == "*" and following == "/":
                output.extend((" ", " "))
                index += 2
                block_comment = False
            else:
                output.append("\n" if char == "\n" else " ")
                index += 1
            continue
        if quote is not None:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in {'"', "'", "`"}:
            quote = char
            output.append(char)
            index += 1
            continue
        if char == "/" and following == "/":
            output.extend((" ", " "))
            index += 2
            line_comment = True
            continue
        if char == "/" and following == "*":
            output.extend((" ", " "))
            index += 2
            block_comment = True
            continue
        output.append(char)
        index += 1

    return "".join(output)


def iter_object_blocks(source: str) -> Iterable[tuple[int, str]]:
    """Yield balanced top-level JavaScript object blocks and their offsets."""
    depth = 0
    start = 0
    quote: str | None = None
    escaped = False
    for index, char in enumerate(source):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'", "`"}:
            quote = char
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}" and depth > 0:
            depth -= 1
            if depth == 0:
                yield start, source[start : index + 1]


def extract_string_property(block: str, property_name: str) -> tuple[str, int] | None:
    """Extract a double-quoted string property and its offset from one object."""
    pattern = re.compile(rf"\b{re.escape(property_name)}\s*:\s*{STRING_PATTERN}")
    match = pattern.search(block)
    if match is None:
        return None
    try:
        value = json.loads(f'"{match.group("value")}"')
    except json.JSONDecodeError:
        return None
    return value, match.start()


def parse_js_file(path: Path) -> list[TrachtEntry]:
    """Parse uncommented plant and HTTP(S) URL pairs from JavaScript objects."""
    if not path.is_file():
        raise FileNotFoundError(f"Required input file is missing: {path}")
    source = strip_js_comments(path.read_text(encoding="utf-8"))
    entries: list[TrachtEntry] = []
    for block_start, block in iter_object_blocks(source):
        plant_field = extract_string_property(block, "plant")
        url_field = extract_string_property(block, "url")
        if plant_field is None or url_field is None:
            continue
        plant, plant_offset = plant_field
        url, _ = url_field
        if not url.startswith(("https://", "http://")):
            continue
        line_no = source.count("\n", 0, block_start + plant_offset) + 1
        entries.append(TrachtEntry(plant=plant, url=url, line_no=line_no))
    return entries


def check_urls(
    entries: Iterable[TrachtEntry],
    timeout_s: float = 15.0,
    delay_s: float = 0.3,
) -> list[UrlProblem]:
    """Fetch plant links and report HTTP, network, decoding, and marker failures."""
    problems: list[UrlProblem] = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    }

    for entry in entries:
        try:
            request = Request(entry.url, headers=headers)
            with urlopen(request, timeout=timeout_s) as response:
                status = response.getcode()
                if status < 200 or status >= 400:
                    raise HTTPError(
                        entry.url, status, "unexpected HTTP status", {}, None
                    )
                charset = response.headers.get_content_charset() or "utf-8"
                html = response.read().decode(charset)
        except HTTPError as exc:
            problems.append(
                UrlProblem(entry.plant, entry.url, entry.line_no, f"HTTP {exc.code}")
            )
        except (URLError, OSError, UnicodeError) as exc:
            problems.append(
                UrlProblem(
                    entry.plant, entry.url, entry.line_no, f"request failed: {exc}"
                )
            )
        else:
            if "Error404" in html:
                problems.append(
                    UrlProblem(
                        entry.plant,
                        entry.url,
                        entry.line_no,
                        "Error404 marker found in HTML",
                    )
                )
        if delay_s > 0:
            time.sleep(delay_s)

    return problems


def main(argv: Sequence[str] | None = None) -> int:
    """Run the URL checker and return a failure status when problems are found."""
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        entries = parse_js_file(args.file)
    except (OSError, UnicodeError) as exc:
        print_error(str(exc))
        return 1

    print_info(f"Checking {len(entries)} plant links from {args.file}.")
    problems = check_urls(entries, timeout_s=args.timeout, delay_s=args.delay)
    if not problems:
        print_success("No problematic URLs found.")
        return 0

    print_error(f"Found {len(problems)} problematic URL(s) in {args.file}.")
    for problem in problems:
        print(
            f"- line {problem.line_no}: plant={problem.plant!r}, url={problem.url}\n"
            f"  reason: {problem.reason}"
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
