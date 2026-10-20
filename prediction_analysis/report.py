#!/usr/bin/env python3
"""Create standalone plots and an English research report from backtest results.

All charts are generated with Matplotlib and saved as both PNG and SVG files.
The report distinguishes retrospective rankings from chronological validation.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from matplotlib.patches import Polygon

from data import ROOT, message, read_json

COLORS = ["#355c9a", "#1b8b82", "#79a447", "#d18b20", "#ab4459"]
HORIZONS = (14, 21, 28)
J_VALUES = (1, 2, 5, 7, 10)


def read_metrics(path: Path) -> list[dict]:
    """Load numeric CSV scores without depending on pandas."""
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row["horizon"] = int(row["horizon"])
        row["count"] = int(row["count"])
        row["J"] = int(row["J"]) if row["J"] else None
        for key in ("mae", "rmse", "bias", "trajectory_mae", "trajectory_rmse"):
            row[key] = float(row[key])
    return rows


def save_figure(figure: plt.Figure, output: Path, name: str) -> None:
    """Save a viewable raster and a scalable export of the same figure."""
    figure.savefig(output / f"{name}.png", dpi=170, bbox_inches="tight")
    figure.savefig(output / f"{name}.svg", bbox_inches="tight")
    plt.close(figure)


def parameter_plot(rows: list[dict], output: Path) -> None:
    """Show all parameter candidates next to the existing linear forecast."""
    figure, axes = plt.subplots(1, 3, figsize=(13, 4.3), constrained_layout=True)
    for axis, horizon in zip(axes, HORIZONS):
        subset = [
            row
            for row in rows
            if row["group"] == "period"
            and row["value"] == "overall"
            and row["horizon"] == horizon
        ]
        historical = sorted(
            (row for row in subset if row["J"]), key=lambda row: row["J"]
        )
        baseline = next(row for row in subset if not row["J"])
        values = [row["mae"] for row in historical]
        bars = axis.bar(range(5), values, color=COLORS)
        for bar, value in zip(bars, values):
            axis.text(
                bar.get_x() + bar.get_width() / 2,
                value + 1,
                f"{value:.1f}",
                ha="center",
                fontsize=9,
            )
        axis.axhline(
            baseline["mae"],
            color="#222222",
            linestyle="--",
            label=f"Linear: {baseline['mae']:.1f}",
        )
        axis.set(
            xticks=range(5),
            xticklabels=J_VALUES,
            xlabel="Previous years J",
            ylabel="Endpoint MAE (°Cd)",
            title=f"{horizon} days",
        )
        axis.set_ylim(0, max(baseline["mae"], *values) * 1.2)
        axis.legend(frameon=False, loc="upper right")
        axis.grid(axis="y", alpha=0.2)
        axis.set_axisbelow(True)
    figure.suptitle("Historical GTS increments versus BeeLot's linear extrapolation")
    save_figure(figure, output, "parameter_scores")


def seasonal_plot(rows: list[dict], output: Path) -> None:
    """Expose seasonal differences hidden by the annual aggregate."""
    figure, axes = plt.subplots(1, 3, figsize=(13, 4), constrained_layout=True)
    for axis, horizon in zip(axes, HORIZONS):
        for method, color, label in [
            (f"history_J{j}", COLORS[index], f"J={j}")
            for index, j in enumerate(J_VALUES)
        ] + [("linear_14", "#222222", "Linear")]:
            selected = sorted(
                (
                    row
                    for row in rows
                    if row["group"] == "month"
                    and row["horizon"] == horizon
                    and row["method"] == method
                ),
                key=lambda row: int(row["value"]),
            )
            axis.plot(
                [int(row["value"]) for row in selected],
                [row["mae"] for row in selected],
                label=label,
                color=color,
                linestyle="--" if method == "linear_14" else "-",
            )
        axis.set(
            title=f"{horizon} days",
            xlabel="Forecast origin month",
            ylabel="Endpoint MAE (°Cd)",
            xticks=range(1, 13),
        )
        axis.grid(alpha=0.2)
    axes[-1].legend(frameon=False, ncol=2, fontsize=8)
    save_figure(figure, output, "seasonal_scores")


def period_plot(rows: list[dict], output: Path, metadata: dict) -> None:
    """Compare historical-window rankings in the full and more recent periods."""
    figure, axes = plt.subplots(1, 3, figsize=(13, 4), constrained_layout=True)
    for axis, horizon in zip(axes, HORIZONS):
        for period, color, label in (
            ("overall", COLORS[0], "All years"),
            (
                "validation",
                COLORS[1],
                f"{metadata['selection_end_year'] + 1}–{metadata['end_year']}",
            ),
            (
                "recent_10_years",
                COLORS[4],
                f"{metadata['end_year'] - 9}–{metadata['end_year']}",
            ),
        ):
            selected = sorted(
                (
                    row
                    for row in rows
                    if row["group"] == "period"
                    and row["value"] == period
                    and row["horizon"] == horizon
                    and row["J"]
                ),
                key=lambda row: row["J"],
            )
            axis.plot(
                range(5),
                [row["mae"] for row in selected],
                marker="o",
                color=color,
                label=label,
            )
        axis.set(
            title=f"{horizon} days",
            xlabel="Previous years J",
            ylabel="Endpoint MAE (°Cd)",
            xticks=range(5),
            xticklabels=J_VALUES,
        )
        axis.grid(alpha=0.2)
    axes[-1].legend(frameon=False)
    save_figure(figure, output, "period_scores")


def yearly_plot(rows: list[dict], output: Path) -> None:
    """Display candidate performance over years without hiding recent climate."""
    figure, axes = plt.subplots(3, 1, figsize=(12, 9), constrained_layout=True)
    for axis, horizon in zip(axes, HORIZONS):
        for method, color, label in [
            (f"history_J{j}", COLORS[index], f"J={j}")
            for index, j in enumerate(J_VALUES)
        ] + [("linear_14", "#222222", "Linear")]:
            selected = sorted(
                (
                    row
                    for row in rows
                    if row["group"] == "year"
                    and row["horizon"] == horizon
                    and row["method"] == method
                ),
                key=lambda row: int(row["value"]),
            )
            axis.plot(
                [int(row["value"]) for row in selected],
                [row["mae"] for row in selected],
                color=color,
                label=label,
                alpha=0.85,
                linestyle="--" if method == "linear_14" else "-",
            )
        axis.set(title=f"{horizon} days", xlabel="Year", ylabel="Endpoint MAE (°Cd)")
        axis.grid(alpha=0.2)
    axes[0].legend(frameon=False, ncol=6)
    save_figure(figure, output, "yearly_scores")


def location_map(metadata: dict, output: Path) -> None:
    """Plot sampled sites against the exact polygons used for sampling."""
    figure, axis = plt.subplots(figsize=(8, 8))
    boundaries = read_json(ROOT / "boundaries.geojson")
    for feature in boundaries["features"]:
        geometry = feature["geometry"]
        polygons = (
            [geometry["coordinates"]]
            if geometry["type"] == "Polygon"
            else geometry["coordinates"]
        )
        for polygon in polygons:
            axis.add_patch(
                Polygon(
                    polygon[0], facecolor="#edf0eb", edgecolor="#7a827a", linewidth=0.7
                )
            )
    for country, color in zip(("DEU", "AUT", "CHE"), COLORS):
        selected = [
            location
            for location in metadata["locations"]
            if location["country"] == country
        ]
        axis.scatter(
            [location["longitude"] for location in selected],
            [location["latitude"] for location in selected],
            color=color,
            label=f"{country} ({len(selected)})",
            s=25,
            zorder=3,
        )
        for location in selected:
            axis.annotate(
                location["id"].replace("site-", ""),
                (location["longitude"], location["latitude"]),
                xytext=(3, 3),
                textcoords="offset points",
                fontsize=7,
            )
    axis.autoscale()
    axis.set_aspect(1 / np.cos(np.deg2rad(50)))
    axis.set(
        xlabel="Longitude (°E)",
        ylabel="Latitude (°N)",
        title=f"{len(metadata['locations'])} reproducible random DACH locations",
    )
    axis.legend(frameon=False)
    axis.grid(alpha=0.15)
    save_figure(figure, output, "locations")


def winner_heatmap(rows: list[dict], output: Path) -> None:
    """Show the best candidate separately for each origin month and horizon."""
    best = np.zeros((3, 12), dtype=int)
    for h_index, horizon in enumerate(HORIZONS):
        for month in range(1, 13):
            subset = [
                row
                for row in rows
                if row["group"] == "month"
                and row["value"] == str(month)
                and row["horizon"] == horizon
                and row["J"]
            ]
            best[h_index, month - 1] = J_VALUES.index(
                min(subset, key=lambda row: row["mae"])["J"]
            )
    figure, axis = plt.subplots(figsize=(11, 2.5), constrained_layout=True)
    axis.imshow(best, cmap=ListedColormap(COLORS), vmin=-0.5, vmax=4.5, aspect="auto")
    for row in range(3):
        for col in range(12):
            axis.text(
                col,
                row,
                f"J={J_VALUES[best[row, col]]}",
                color="white",
                ha="center",
                va="center",
                fontweight="bold",
            )
    axis.set(
        xticks=range(12),
        xticklabels=range(1, 13),
        yticks=range(3),
        yticklabels=[f"{h} days" for h in HORIZONS],
        xlabel="Forecast origin month",
        title="Retrospective best historical window by month",
    )
    save_figure(figure, output, "monthly_winners")


def build_report(metadata: dict, rows: list[dict], output: Path) -> None:
    """Write conclusions with complete methodological limits and artifact links."""
    lines = [
        "# BeeLot historical-increment prediction backtest",
        "",
        f"Generated: {metadata['created_at']}",
        "",
        "## Recommended parameters",
        "",
        "Ranked by endpoint mean absolute error (MAE), in °Cd. Lower is better.",
        "",
        "| Horizon | Best J, all years | MAE | RMSE | Bias | Linear MAE | MAE reduction | Forecast origins |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for rec in metadata["recommendations"]:
        best = rec["ranking"][0]
        lines.append(
            f"| {rec['horizon']} days | {rec['best_overall_J']} | {best['mae']:.3f} | {best['rmse']:.3f} | {best['bias']:+.3f} | {rec['linear_baseline']['mae']:.3f} | {rec['improvement_vs_linear_percent']:.1f}% | {best['count']:,} |"
        )
    lines.extend(
        [
            "",
            "![Parameter comparison](parameter_scores.png)",
            "",
            "## Every requested parameter combination",
            "",
            "| Horizon | J | Endpoint MAE | RMSE | Bias | Trajectory MAE |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for rec in metadata["recommendations"]:
        for row in rec["ranking"]:
            lines.append(
                f"| {rec['horizon']} | {row['J']} | {row['mae']:.3f} | {row['rmse']:.3f} | {row['bias']:+.3f} | {row['trajectory_mae']:.3f} |"
            )
    lines.extend(
        [
            "",
            "## Chronological validation",
            "",
            f"Select J using {metadata['start_year']}–{metadata['selection_end_year']} only, then freeze it for {metadata['selection_end_year'] + 1}–{metadata['end_year']}. Historical reference windows still roll forward using only years preceding each forecast origin.",
            "",
            "| Horizon | J selected before validation | Validation MAE | Validation RMSE | Validation linear MAE |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for rec in metadata["recommendations"]:
        row = rec["frozen_validation"]
        lines.append(
            f"| {rec['horizon']} | {rec['selected_on_training_J']} | {row['mae']:.3f} | {row['rmse']:.3f} | {rec['validation_linear_baseline']['mae']:.3f} |"
        )
    lines.extend(
        [
            "",
            "![Period comparison](period_scores.png)",
            "",
            "Retrospective recent-period ranks complement the frozen-choice validation; choosing a new J after seeing validation outcomes would be another selection step.",
            "",
            "| Period | Horizon | Best J after observing that period | Best MAE | J=7 MAE | J=10 MAE |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for period in ("validation", "recent_10_years"):
        for horizon in HORIZONS:
            subset = [
                row
                for row in rows
                if row["group"] == "period"
                and row["value"] == period
                and row["horizon"] == horizon
                and row["J"]
            ]
            best = min(subset, key=lambda row: row["mae"])
            seven = next(row for row in subset if row["J"] == 7)
            ten = next(row for row in subset if row["J"] == 10)
            lines.append(
                f"| {period} | {horizon} | {best['J']} | {best['mae']:.3f} | {seven['mae']:.3f} | {ten['mae']:.3f} |"
            )
    lines.extend(
        [
            "",
            "## Robustness of the retrospective winner",
            "",
            "Paired bootstrap resamples whole target-year blocks, retaining all locations and overlapping origins within each year. Intervals describe uncertainty in mean absolute-error differences, not individual forecast prediction intervals. Negative differences favor the winner. These intervals do not correct for selecting the winner on the same full dataset, temporal climate trends or spatial sampling uncertainty.",
            "",
            "| Horizon | Winner minus next-best J: MAE difference [95% interval] | Winner minus linear: difference [95% interval] |",
            "|---|---|---|",
        ]
    )
    for rec in metadata["recommendations"]:
        a, b = rec["bootstrap_vs_runner_up"], rec["bootstrap_vs_linear"]
        lines.append(
            f"| {rec['horizon']} | {a['difference_mae']:+.3f} [{a['lower_95']:+.3f}, {a['upper_95']:+.3f}] | {b['difference_mae']:+.3f} [{b['lower_95']:+.3f}, {b['upper_95']:+.3f}] |"
        )
    lines.extend(
        [
            "",
            "## Country and season checks",
            "",
            "Descriptive subgroup winners use the full period, so they are not independently validated adaptive rules.",
            "",
            "| Subgroup | Horizon | Best J | MAE | Linear MAE |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for group, value in [("country", code) for code in ("DEU", "AUT", "CHE")] + [
        ("season", "February-June"),
        ("period", "recent_10_years"),
    ]:
        for horizon in HORIZONS:
            subset = [
                row
                for row in rows
                if row["group"] == group
                and row["value"] == value
                and row["horizon"] == horizon
            ]
            if not subset:
                continue
            best = min((row for row in subset if row["J"]), key=lambda row: row["mae"])
            baseline = next(row for row in subset if not row["J"])
            lines.append(
                f"| {value} | {horizon} | {best['J']} | {best['mae']:.3f} | {baseline['mae']:.3f} |"
            )
    lines.extend(
        [
            "",
            "![Seasonal errors](seasonal_scores.png)",
            "",
            "![Monthly winners](monthly_winners.png)",
            "",
            "![Yearly errors](yearly_scores.png)",
            "",
            "## Design and interpretation",
            "",
            f"- Target years: {metadata['start_year']}–{metadata['end_year']} inclusive ({metadata['end_year'] - metadata['start_year'] + 1} years, not 46). Input warm-up begins ten years earlier. The last archive day is {metadata['archive_end_date']}.",
            f"- {len(metadata['locations'])} fixed random sites; seed {metadata.get('sampling_seed', metadata['seed'])}. Sampling is approximately uniform by land area across the union of Germany, Austria and Switzerland, after rounding to BeeLot's 0.01° request precision. Countries are not equally weighted; sites include mountain terrain and are not a sample of apiary locations.",
            "- Daily temperatures use the exact BeeLot `/v1/era5` endpoint, `temperature_2m_mean`, `Europe/Berlin`, and default elevation adjustment. Despite its name, this endpoint defaults to `archive_best_match`, a blend of ERA5, ERA5-Land and (from 2017) IFS; no explicit model is requested, exactly as in BeeLot. This model change can confound comparisons across decades; the experiment is not a homogeneous ERA5-only climate study. GTS is computed by importing the unchanged production `calculateGTS()` function in Node, separately for each year. Positive temperatures receive weights 0.5 in January, 0.75 in February and 1 afterward; output rounding is exactly BeeLot's JavaScript rounding.",
            "- For origin t, forecast offset k and history length J: `prediction(t+k) = GTS(t) + mean_y(GTS_y(calendar(t+k)) - GTS_y(calendar(t)))`, with y = target_year−1 through target_year−J. Subtract before averaging. The current-year GTS anchor is known; the future target-year curve is used only to score predictions.",
            "- Calendar month/day alignment follows the proposed predictor. February 29 in a non-leap reference year is interpolated halfway between February 28 and March 1. This differs deliberately from BeeLot's existing historical chart day-index display; the chart implementation is unchanged.",
            "- Only full 14/21/28-day horizons inside the origin calendar year and entirely covered by the archive are scored. No truncated horizons or cross-year GTS resets enter the ranking. All J candidates and the baseline use exactly the same origins for a given horizon.",
            "- The baseline reproduces the current slope from up to 14 preceding GTS increments, with a zero slope on January 1. BeeLot currently uses it for 14 days; the same slope is extended to 21 and 28 days only as an experimental comparison.",
            "- Error = predicted GTS minus actual archive-derived GTS. MAE is the primary endpoint criterion; RMSE penalizes large misses and signed bias exposes over/underprediction. Trajectory MAE/RMSE average all lead days 1..H, not just the endpoint. A larger horizon cannot be declared superior merely because its J winner differs; the horizons solve different forecasting tasks.",
            "- These are historical reanalysis hindcasts with perfect knowledge of GTS at the origin, not tests against station measurements or archived as-issued forecasts. Current-year archive data can still be revised. No forecast data fills the evaluation targets. Overlapping daily forecasts are dependent, and climate non-stationarity can favor shorter or longer rolling windows differently over time.",
            "- The hindsight best J for one individual origin uses the future outcome and is an oracle diagnostic only. It is not an implementable choice at forecast time. A month-, location- or weather-dependent selection rule needs separate forward validation.",
            "",
            "![Random site map](locations.png)",
            "",
            "## Reusable artifacts",
            "",
            "- [All subgroup metrics](metrics.csv) and [overall rankings](ranking.csv).",
            "- [Configuration, provenance and recommendations](summary.json), including raw-cache SHA-256 hashes and production GTS source hash.",
            "- `forecast_errors.npz`: arrays for every horizon; columns of `hH_errors` follow `summary.json.methods`. `predicted_GTS = hH_gts_actual + hH_errors[:, method_index]`. Sites index `summary.json.locations`; origins are Python ordinal dates. Per-origin full-trajectory MAE/MSE are included.",
            "- `hindsight_best_J.csv.gz`: best J per origin and horizon, tie count and absolute error. Ties choose the smallest J for display only.",
            "- Plots are available as PNG and SVG for reuse. Raw API JSON and rate-budget state remain in the sibling `cache/` directory.",
            "",
            "## Sources and attribution",
            "",
            "- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), using the default historical blend of Copernicus ERA5/ERA5-Land and ECMWF IFS. Weather data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This analysis transforms temperatures into GTS and forecast errors.",
            "- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain 1:50m country polygons. The exact filtered geometry and source checksum are stored in `boundaries.geojson`.",
            "- [Open-Meteo API weighting and limits](https://open-meteo.com/en/pricing). Sequential downloads use persistent weighted minute/hour/day budgets and fail explicitly on HTTP 429.",
            "",
        ]
    )
    if (metadata.get("batch_equivalence") or {}).get("passed"):
        checks = metadata["batch_equivalence"]["annual_request_checks"]
        lines.extend(
            [
                "## Download batching spot check",
                "",
                "At the first sampled location, separate annual requests matching BeeLot's past-year request pattern were compared with the multi-decade download. All daily temperatures matched exactly in these spot checks; other locations were not exhaustively re-downloaded.",
                "",
                "| Year | Daily temperatures compared | Maximum difference (°C) |",
                "|---|---:|---:|",
            ]
        )
        lines.extend(
            f"| {check['year']} | {check['days']} | {check['maximum_temperature_difference']:.6f} |"
            for check in checks
        )
        lines.append("")
    (output / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    """Create the research report from completed numerical outputs."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        add_help=False,
        epilog="Example: python report.py --results-dir results\nCreate the tables and plots from an existing backtest without network requests.",
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=ROOT / "results",
        help="Completed backtest directory (default: prediction_analysis/results).",
    )
    args = parser.parse_args(argv)
    try:
        metadata = read_json(args.results_dir / "summary.json")
        rows = read_metrics(args.results_dir / "metrics.csv")
        plt.rcParams.update(
            {
                "font.family": "DejaVu Sans",
                "axes.spines.top": False,
                "axes.spines.right": False,
            }
        )
        parameter_plot(rows, args.results_dir)
        seasonal_plot(rows, args.results_dir)
        period_plot(rows, args.results_dir, metadata)
        yearly_plot(rows, args.results_dir)
        location_map(metadata, args.results_dir)
        winner_heatmap(rows, args.results_dir)
        build_report(metadata, rows, args.results_dir)
        message("SUCCESS", f"Report: {args.results_dir / 'REPORT.md'}")
        return 0
    except (OSError, ValueError, KeyError) as error:
        message("ERROR", str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
