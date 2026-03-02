#!/usr/bin/env python3
"""Compute GTS values from JavaScript arrays and emit Jest expectation output."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Sequence


def build_parser() -> argparse.ArgumentParser:
    """Create and return argument parser."""
    parser = argparse.ArgumentParser(
        description=(
            "Parse `dates` and `values` arrays from a JS file, calculate GTS, "
            "and write Jest expectation output."
        ),
        epilog=(
            "Examples:\n"
            "  ./scripts/gts.py -i input.js -o output.txt\n"
            "  ./scripts/gts.py --input ./tmp/test_data.js --output ./tmp/gts_expectation.txt\n"
            "  ./scripts/gts.py --help"
        ),
        formatter_class=argparse.RawTextHelpFormatter,
        add_help=False,
    )
    parser.add_argument("-h", "--help", "-?", action="help", help="Show this help message and exit.")
    parser.add_argument(
        "-i",
        "--input",
        required=True,
        help="Path to input JS file containing `const dates = [...]` and `const values = [...]`.",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Path to output file for generated Jest expectation block.",
    )
    return parser


def parse_js_arrays(input_file: Path) -> tuple[list[str], list[float]]:
    """Parse JavaScript arrays for dates and values from input file."""
    if not input_file.exists():
        raise FileNotFoundError(f"Input file is missing: {input_file}")

    content = input_file.read_text(encoding="utf-8")

    dates_match = re.search(r"const dates = \[(.*?)\];", content, re.DOTALL)
    values_match = re.search(r"const values = \[(.*?)\];", content, re.DOTALL)
    if not dates_match or not values_match:
        raise ValueError("Input file must contain valid `dates` and `values` arrays.")

    dates_str = dates_match.group(1).strip()
    values_str = values_match.group(1).strip()

    try:
        dates = json.loads("[" + dates_str.replace("'", '"') + "]")
        values = json.loads("[" + values_str + "]")
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"JSON parsing error in extracted arrays at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc

    if not isinstance(dates, list) or not isinstance(values, list):
        raise ValueError("Parsed `dates` and `values` must be JSON arrays.")

    return [str(item) for item in dates], [float(item) for item in values]


def calculate_gts(dates: list[str], values: list[float]) -> list[dict[str, float | str]]:
    """Calculate GTS using monthly weighting rules."""
    if len(dates) != len(values):
        raise ValueError("The dates and values arrays must have the same length.")

    cumulative_sum = 0.0
    results: list[dict[str, float | str]] = []

    for idx, value in enumerate(values):
        val = max(0.0, value)
        current_date = datetime.strptime(dates[idx], "%Y-%m-%d")
        month = current_date.month

        if month == 1:
            val *= 0.5
        elif month == 2:
            val *= 0.75

        cumulative_sum += val
        results.append({"date": dates[idx], "gts": round(cumulative_sum, 2)})

    return results


def write_output(output_file: Path, results: list[dict[str, float | str]]) -> None:
    """Write calculated GTS values in Jest expectation format."""
    lines: list[str] = ["        expect(result).toEqual([\n"]
    for idx, result in enumerate(results):
        date_str = str(result["date"])
        gts_value = float(result["gts"])
        if idx == 0:
            lines.append(f"            // 0 + ({gts_value:.1f} * 0.5) = {gts_value}\n")
        else:
            prev_gts = float(results[idx - 1]["gts"])
            increment = gts_value - prev_gts
            month = datetime.strptime(date_str, "%Y-%m-%d").month
            weight = 0.5 if month == 1 else 0.75 if month == 2 else 1.0
            if increment > 0:
                lines.append(f"            // {prev_gts} + ({increment / weight:.1f} * {weight}) = {gts_value}\n")
            else:
                lines.append(f"            // {prev_gts} + (0 * {weight}) = {gts_value}\n")
        lines.append(f"            {{ date: '{date_str}', gts: {gts_value} }},\n")

    lines.append("        ]);\n")
    output_file.write_text("".join(lines), encoding="utf-8")


def main(argv: Sequence[str]) -> int:
    """Run CLI and return exit status."""
    parser = build_parser()
    if len(argv) == 0:
        parser.print_help()
        return 0

    args = parser.parse_args(argv)
    input_path = Path(args.input)
    output_path = Path(args.output)

    try:
        dates, values = parse_js_arrays(input_path)
        results = calculate_gts(dates, values)
        write_output(output_path, results)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"GTS calculation completed successfully. Results saved to {output_path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
