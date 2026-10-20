#!/usr/bin/env python3
"""Download reproducible, validated weather inputs for the prediction backtest.

Requests use BeeLot's ERA5 endpoint, coordinate precision and Berlin time zone.
Downloads are sequential, cached atomically, and respect weighted API budgets.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import random
import sys
import time
import zlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Final, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT: Final = Path(__file__).resolve().parent
ENDPOINT: Final = "https://archive-api.open-meteo.com/v1/era5"
BOUNDARY_URL: Final = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)
COUNTRIES: Final = {"DEU": "Germany", "AUT": "Austria", "CHE": "Switzerland"}


def message(category: str, text: str) -> None:
    """Print a categorized message, using color only on a terminal."""
    stream = sys.stderr if category == "ERROR" else sys.stdout
    colors = {"ERROR": 31, "WARNING": 33, "INFO": 36, "SUCCESS": 32, "DEBUG": 90}
    output = f"{category}: {text}"
    if stream.isatty():
        output = f"\033[{colors[category]}m{output}\033[0m"
    print(output, file=stream, flush=True)


def find_json_file(path: Path) -> Path | None:
    """Find the requested file, falling back to its gzip counterpart."""
    if path.is_file():
        return path
    compressed = Path(f"{path}.gz")
    if path.suffix != ".gz" and compressed.is_file():
        return compressed
    return None


def resolve_json_file(path: Path) -> Path:
    """Resolve a mandatory plain or compressed JSON input with clear errors."""
    resolved = find_json_file(path)
    if resolved is None:
        alternative = f" (or {path}.gz)" if path.suffix != ".gz" else ""
        raise FileNotFoundError(f"Required input file is missing: {path}{alternative}")
    return resolved


def read_json_bytes(path: Path) -> bytes:
    """Read original JSON bytes, decompressing gzip without changing the content."""
    resolved = resolve_json_file(path)
    try:
        raw = resolved.read_bytes()
        return gzip.decompress(raw) if resolved.suffix == ".gz" else raw
    except (OSError, EOFError, zlib.error) as error:
        raise ValueError(f"Cannot read JSON input {resolved}: {error}") from error


def json_file_sha256(path: Path) -> str:
    """Hash JSON content so lossless compression preserves input provenance."""
    return hashlib.sha256(read_json_bytes(path)).hexdigest()


def read_json(path: Path) -> Any:
    """Read plain/gzip JSON with precise path and parse-position diagnostics."""
    resolved = resolve_json_file(path)
    try:
        return json.loads(read_json_bytes(resolved).decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Invalid JSON in {resolved}, line {error.lineno}, "
            f"column {error.colno}: {error.msg}"
        ) from error
    except UnicodeDecodeError as error:
        raise ValueError(f"Invalid UTF-8 JSON in {resolved}: {error}") from error


def write_json(path: Path, value: Any) -> None:
    """Atomically write UTF-8 JSON, preserving an existing gzip representation."""
    path = find_json_file(path) or path
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    raw = (
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    ).encode("utf-8")
    temporary.write_bytes(gzip.compress(raw, mtime=0) if path.suffix == ".gz" else raw)
    temporary.replace(path)


def inside_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Determine point containment by the even-odd ray rule."""
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        if (y1 > lat) != (y2 > lat):
            crossing = (x2 - x1) * (lat - y1) / (y2 - y1) + x1
            if lon < crossing:
                inside = not inside
        previous = current
    return inside


def inside_country(lon: float, lat: float, geometry: dict[str, Any]) -> bool:
    """Check polygon exteriors and exclude holes, including multipolygons."""
    polygons = (
        [geometry["coordinates"]]
        if geometry["type"] == "Polygon"
        else geometry["coordinates"]
    )
    return any(
        inside_ring(lon, lat, polygon[0])
        and not any(inside_ring(lon, lat, hole) for hole in polygon[1:])
        for polygon in polygons
    )


def sample_locations(boundaries: dict[str, Any], count: int, seed: int) -> list:
    """Sample uniformly by land area across DACH using seeded rejection sampling."""
    rng = random.Random(seed)
    locations = []
    seen = set()
    # Uniform longitude and sin(latitude) give equal area on a sphere.
    while len(locations) < count:
        lon = round(rng.uniform(5.8, 17.2), 2)
        lat = round(
            math.degrees(
                math.asin(
                    rng.uniform(
                        math.sin(math.radians(45.7)), math.sin(math.radians(55.2))
                    )
                )
            ),
            2,
        )
        if (lat, lon) in seen:
            continue
        country = next(
            (
                code
                for code, geometry in boundaries.items()
                if inside_country(lon, lat, geometry)
            ),
            None,
        )
        if country is None:
            continue
        seen.add((lat, lon))
        locations.append(
            {
                "id": f"site-{len(locations) + 1:02d}",
                "country": country,
                "latitude": lat,
                "longitude": lon,
            }
        )
    return locations


def prepare_locations(count: int, seed: int) -> None:
    """Fetch public country geometry once and persist the fixed random sample."""
    boundary_path = ROOT / "boundaries.geojson"
    if find_json_file(boundary_path) is None:
        with urlopen(BOUNDARY_URL, timeout=60) as response:
            raw = response.read()
        source = json.loads(raw)
        features = [
            feature
            for feature in source["features"]
            if feature["properties"].get("ADM0_A3") in COUNTRIES
        ]
        write_json(
            boundary_path,
            {
                "type": "FeatureCollection",
                "source": BOUNDARY_URL,
                "source_sha256": hashlib.sha256(raw).hexdigest(),
                "license": "Natural Earth public domain",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"country": f["properties"]["ADM0_A3"]},
                        "geometry": f["geometry"],
                    }
                    for f in features
                ],
            },
        )
    source = read_json(boundary_path)
    boundaries = {f["properties"]["country"]: f["geometry"] for f in source["features"]}
    locations = sample_locations(boundaries, count, seed)
    write_json(
        ROOT / "locations.json",
        {
            "seed": seed,
            "sampling": "uniform DACH land area; coordinates rounded to 0.01 degrees",
            "locations": locations,
        },
    )
    message(
        "SUCCESS",
        f"Prepared {count} locations: "
        + ", ".join(
            f"{code}={sum(p['country'] == code for p in locations)}"
            for code in COUNTRIES
        ),
    )


class RateBudget:
    """Persist weighted requests and wait for safe minute/hour/day boundaries."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def reserve(self, weight: float) -> None:
        """Reserve budget before sending, including requests that later fail."""
        while True:
            now = time.time()
            entries = read_json(self.path) if find_json_file(self.path) else []
            entries = [entry for entry in entries if entry[0] >= now - 86400]
            waits = []
            for seconds, limit in ((60, 540), (3600, 4800), (86400, 9500)):
                boundary = math.floor(now / seconds) * seconds
                used = sum(value for stamp, value in entries if stamp >= boundary)
                if used + weight > limit:
                    waits.append(boundary + seconds + 3 - now)
            if not waits:
                entries.append([now, weight])
                write_json(self.path, entries)
                return
            delay = min(50.0, max(waits))
            message("INFO", f"Respecting API budget; next check in {delay:.0f} s.")
            time.sleep(delay)


def validate_daily(payload: Any, start: date, end: date, context: str) -> None:
    """Reject incomplete, malformed or unphysical weather responses."""
    daily = payload.get("daily") if isinstance(payload, dict) else None
    dates = daily.get("time") if isinstance(daily, dict) else None
    temperatures = daily.get("temperature_2m_mean") if isinstance(daily, dict) else None
    expected = [
        (start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)
    ]
    if (
        dates != expected
        or not isinstance(temperatures, list)
        or len(temperatures) != len(expected)
    ):
        raise ValueError(
            f"Incomplete daily arrays in {context}; expected {start} through {end}."
        )
    for stamp, value in zip(dates, temperatures):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not -90 <= value <= 65
        ):
            raise ValueError(
                f"Invalid daily temperature in {context} on {stamp}: {value!r}"
            )


def fetch_weather(
    location: dict, start: date, end: date, cache: Path, budget: RateBudget
) -> Path:
    """Fetch one location's complete history with finite retries and provenance."""
    params = {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_mean",
        "timezone": "Europe/Berlin",
    }
    url = f"{ENDPOINT}?{urlencode(params)}"
    path = cache / f"{location['id']}_{start}_{end}.json"
    cached_path = find_json_file(path)
    if cached_path is not None:
        cached = read_json(cached_path)
        if cached.get("request_url") != url:
            raise ValueError(
                f"Cache request does not match the selected location: {cached_path}"
            )
        validate_daily(cached["response"], start, end, str(cached_path))
        message("INFO", f"Cache hit: {location['id']}")
        return cached_path
    weight = max(1.0, ((end - start).days + 1) / 140)
    for attempt in range(4):
        budget.reserve(weight)
        message(
            "INFO",
            f"Downloading {location['id']} ({location['country']}), {start} to {end}, estimated weight {weight:.1f}.",
        )
        try:
            request = Request(
                url, headers={"User-Agent": "BeeLot-Prediction-Analysis/1.0"}
            )
            with urlopen(request, timeout=180) as response:
                raw = response.read()
            payload = json.loads(raw)
            validate_daily(payload, start, end, url)
            write_json(
                path,
                {
                    "request_url": url,
                    "downloaded_at": datetime.now(timezone.utc).isoformat(),
                    "response_sha256": hashlib.sha256(raw).hexdigest(),
                    "response": payload,
                },
            )
            return path
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            if error.code == 429:
                raise RuntimeError(
                    f"Open-Meteo rate limit for {location['id']}: {detail}. Cached data is preserved; resume later."
                ) from error
            if error.code < 500 or attempt == 3:
                raise RuntimeError(
                    f"HTTP {error.code} for {location['id']}: {detail}"
                ) from error
            message("WARNING", f"HTTP {error.code}; retrying after backoff.")
        except (URLError, TimeoutError, ConnectionError) as error:
            if attempt == 3:
                raise RuntimeError(
                    f"Weather download failed for {location['id']}: {error}"
                ) from error
            message(
                "WARNING", f"Temporary download failure for {location['id']}: {error}"
            )
        time.sleep(2 ** (attempt + 1))
    raise RuntimeError("Weather retry limit exhausted.")


def main(argv: Sequence[str] | None = None) -> int:
    """Prepare sites or download complete histories using a restartable cache."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n  python data.py --prepare\n    Generate the reproducible country sample.\n  python data.py --end-date 2026-10-13\n    Download historical inputs, resuming from validated cache files.",
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--prepare",
        action="store_true",
        help="Generate boundaries and locations before downloading.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=40,
        help="Number of random locations (default: 40).",
    )
    parser.add_argument(
        "--seed", type=int, default=20261020, help="Sampling seed (default: 20261020)."
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=1970,
        help="Weather start year, including the ten-year warm-up (default: 1970).",
    )
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        default=date.today() - timedelta(days=7),
        help="Last complete archive date, YYYY-MM-DD (default: today minus seven days).",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT / "cache",
        help="Restartable download cache directory.",
    )
    args = parser.parse_args(argv)
    if (
        args.count < 1
        or args.start_year < 1940
        or args.end_date < date(args.start_year, 1, 1)
        or args.end_date >= date.today()
    ):
        parser.error(
            "Require a positive count, start year >= 1940, and a past end date after the start."
        )
    try:
        if args.prepare:
            prepare_locations(args.count, args.seed)
        locations = read_json(ROOT / "locations.json")["locations"]
        budget = RateBudget(args.cache_dir / "request_budget.json")
        paths = [
            fetch_weather(
                location,
                date(args.start_year, 1, 1),
                args.end_date,
                args.cache_dir,
                budget,
            )
            for location in locations
        ]
        write_json(
            args.cache_dir / "manifest.json",
            {
                "start_date": f"{args.start_year}-01-01",
                "end_date": args.end_date.isoformat(),
                "endpoint": ENDPOINT,
                "locations": locations,
                "files": [path.name for path in paths],
            },
        )
        message(
            "SUCCESS", f"All {len(paths)} weather histories are complete and validated."
        )
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        message("ERROR", str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
