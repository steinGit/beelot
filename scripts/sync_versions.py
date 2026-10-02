#!/usr/bin/env python3
"""Synchronize version values in the JavaScript package metadata."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Final, Literal, Sequence, TypedDict

VERSION_JS_PATH: Final[Path] = Path("assets/js/version.js")
PACKAGE_JSON_PATH: Final[Path] = Path("package.json")
PACKAGE_LOCK_PATH: Final[Path] = Path("package-lock.json")

ANSI_ERROR: Final[str] = "\033[31m"
ANSI_WARNING: Final[str] = "\033[33m"
ANSI_INFO: Final[str] = "\033[36m"
ANSI_SUCCESS: Final[str] = "\033[32m"
ANSI_DEBUG: Final[str] = "\033[90m"
ANSI_RESET: Final[str] = "\033[0m"

SourceKind = Literal["version-js", "package-json", "max"]


class PackageJsonData(TypedDict, total=False):
    version: str


class PackageLockRootData(TypedDict, total=False):
    version: str


class PackageLockData(TypedDict, total=False):
    version: str
    packages: dict[str, PackageLockRootData]


def print_error(message: str) -> None:
    print(f"{ANSI_ERROR}ERROR: {message}{ANSI_RESET}", file=sys.stderr)


def print_warning(message: str) -> None:
    print(f"{ANSI_WARNING}WARNING: {message}{ANSI_RESET}")


def print_info(message: str) -> None:
    print(f"{ANSI_INFO}{message}{ANSI_RESET}")


def print_success(message: str) -> None:
    print(f"{ANSI_SUCCESS}{message}{ANSI_RESET}")


def print_debug(message: str) -> None:
    print(f"{ANSI_DEBUG}{message}{ANSI_RESET}")


def usage() -> str:
    return (
        "sync_versions.py [--source {version-js,package-json,max}] [--check] [--dryrun]\n\n"
        "Examples:\n"
        "  ./scripts/sync_versions.py --source version-js\n"
        "  ./scripts/sync_versions.py --source package-json\n"
        "  ./scripts/sync_versions.py --source max --check --dryrun\n"
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Synchronize versions in package.json, package-lock.json, and "
            "assets/js/version.js."
        ),
        usage=usage(),
        add_help=False,
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--source",
        choices=("version-js", "package-json", "max"),
        required=True,
        help="Defines which file is treated as source of truth.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not modify files, only validate consistency.",
    )
    parser.add_argument(
        "--dryrun",
        action="store_true",
        help="Print intended changes without writing files.",
    )
    if len(argv) == 0:
        parser.print_help()
        sys.exit(0)
    return parser.parse_args(argv)


def ensure_file_exists(path: Path) -> None:
    if not path.exists():
        print_error(f"Required file is missing: {path}")
        sys.exit(1)


def read_version_js(path: Path) -> str:
    ensure_file_exists(path)
    content = path.read_text(encoding="utf-8")
    match = re.search(r'export\s+const\s+VERSION\s*=\s*"([^"]+)"\s*;?', content)
    if match is None:
        print_error(f"Could not extract VERSION from file: {path}")
        sys.exit(1)
    return match.group(1).strip()


def read_package_json(path: Path) -> PackageJsonData:
    ensure_file_exists(path)
    try:
        raw_data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print_error(
            f"JSON parsing error in {path.name} at line {error.lineno}, column {error.colno}: "
            f"{error.msg}"
        )
        sys.exit(1)
    if not isinstance(raw_data, dict):
        print_error(f"Invalid JSON structure in {path.name}: expected an object.")
        sys.exit(1)
    return raw_data  # type: ignore[return-value]


def read_package_lock(path: Path) -> PackageLockData:
    """Read and validate npm lockfile version metadata."""
    data = read_package_json(path)
    packages = data.get("packages")
    root_package = packages.get("") if isinstance(packages, dict) else None
    if not isinstance(root_package, dict):
        print_error(f"Missing or invalid root package metadata in {path}")
        sys.exit(1)
    return data  # type: ignore[return-value]


def get_package_lock_versions(data: PackageLockData) -> tuple[str, str]:
    """Return top-level and root-package versions from a lockfile."""
    top_level = data.get("version")
    root_package = data.get("packages", {}).get("")
    root_version = root_package.get("version") if root_package else None
    if not isinstance(top_level, str) or not top_level.strip():
        print_error(
            f"Missing or invalid top-level 'version' field in {PACKAGE_LOCK_PATH}"
        )
        sys.exit(1)
    if not isinstance(root_version, str) or not root_version.strip():
        print_error(
            f"Missing or invalid root package 'version' field in {PACKAGE_LOCK_PATH}"
        )
        sys.exit(1)
    return top_level, root_version


def write_version_js(path: Path, version: str, dryrun: bool) -> None:
    content = f'// assets/js/version.js\nexport const VERSION = "{version}";\n'
    if dryrun:
        print_debug(f"DRYRUN write {path} => VERSION={version}")
        return
    path.write_text(content, encoding="utf-8")


def write_package_json(path: Path, data: PackageJsonData, dryrun: bool) -> None:
    content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if dryrun:
        print_debug(
            f"DRYRUN write {path} => version={data.get('version', '<missing>')}"
        )
        return
    path.write_text(content, encoding="utf-8")


def write_package_lock(
    path: Path, data: PackageLockData, version: str, dryrun: bool
) -> None:
    """Write synchronized top-level and root-package lockfile versions."""
    data["version"] = version
    data["packages"][""]["version"] = version
    content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if dryrun:
        print_debug(f"DRYRUN write {path} => version={version}")
        return
    path.write_text(content, encoding="utf-8")


def parse_version(
    version: str,
) -> tuple[tuple[int, int, int], tuple[tuple[int, object], ...], bool]:
    match = re.match(
        r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$",
        version,
    )
    if not match:
        print_error(f"Invalid version format: {version}")
        sys.exit(1)

    major, minor, patch = (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
    )
    prerelease = match.group(4)
    if prerelease is None:
        return (major, minor, patch), tuple(), True

    parts = []
    for item in prerelease.split("."):
        if item.isdigit():
            parts.append((0, int(item)))
        else:
            parts.append((1, item))

    return (major, minor, patch), tuple(parts), False


def max_version(version_a: str, version_b: str) -> str:
    core_a, pre_a, is_release_a = parse_version(version_a)
    core_b, pre_b, is_release_b = parse_version(version_b)
    key_a = (core_a, is_release_a, pre_a)
    key_b = (core_b, is_release_b, pre_b)
    return version_a if key_a >= key_b else version_b


def check_or_sync(source: SourceKind, check: bool, dryrun: bool) -> int:
    version_js_value = read_version_js(VERSION_JS_PATH)
    package_json_data = read_package_json(PACKAGE_JSON_PATH)
    package_lock_data = read_package_lock(PACKAGE_LOCK_PATH)
    package_json_value = package_json_data.get("version")
    lockfile_value, lockfile_root_value = get_package_lock_versions(package_lock_data)

    if not isinstance(package_json_value, str) or not package_json_value.strip():
        print_error(f"Missing or invalid 'version' field in {PACKAGE_JSON_PATH}")
        return 1

    if source == "version-js":
        source_value = version_js_value
    elif source == "package-json":
        source_value = package_json_value
    else:
        source_value = max_version(version_js_value, package_json_value)

    print_info(
        f"Source={source} | version.js={version_js_value} | "
        f"package.json={package_json_value} | package-lock.json={lockfile_value} "
        f"(root={lockfile_root_value})"
    )

    versions_match = (
        version_js_value == source_value
        and package_json_value == source_value
        and lockfile_value == source_value
        and lockfile_root_value == source_value
    )

    if check:
        if versions_match:
            print_success("Version files are synchronized.")
            return 0
        print_error(
            "Version mismatch detected: "
            f"expected={source_value}, version.js={version_js_value}, "
            f"package.json={package_json_value}, package-lock.json={lockfile_value}, "
            f"package-lock root={lockfile_root_value}"
        )
        return 1

    if versions_match:
        print_warning("No changes required. Versions are already synchronized.")
        return 0

    if source == "version-js":
        package_json_data["version"] = source_value
        write_package_json(PACKAGE_JSON_PATH, package_json_data, dryrun=dryrun)
        write_package_lock(PACKAGE_LOCK_PATH, package_lock_data, source_value, dryrun)
        print_success(
            f"Synchronized package metadata to '{source_value}' from assets/js/version.js."
        )
        return 0

    if source == "package-json":
        write_version_js(VERSION_JS_PATH, source_value, dryrun=dryrun)
        write_package_lock(PACKAGE_LOCK_PATH, package_lock_data, source_value, dryrun)
        print_success(
            f"Synchronized version.js and package-lock.json to '{source_value}' from package.json."
        )
        return 0

    package_json_data["version"] = source_value
    write_package_json(PACKAGE_JSON_PATH, package_json_data, dryrun=dryrun)
    write_version_js(VERSION_JS_PATH, source_value, dryrun=dryrun)
    write_package_lock(PACKAGE_LOCK_PATH, package_lock_data, source_value, dryrun)
    print_success(
        f"Synchronized package metadata and version.js to max version '{source_value}'."
    )
    return 0


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    return check_or_sync(
        source=args.source,
        check=args.check,
        dryrun=args.dryrun,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
