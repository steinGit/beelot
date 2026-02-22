#!/usr/bin/env python3
"""Release automation script for creating a release from dev branch.

This script reads version values from assets/js/version.js and package.json on dev,
uses the maximum of the two as the release version, merges dev into main,
commits the version update if needed, creates
an annotated git tag, pushes changes and tags, and finally merges
main back into dev.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Final, List, Sequence, Tuple


VERSION_FILE: Final[Path] = Path("assets/js/version.js")
PACKAGE_FILE: Final[Path] = Path("package.json")
SYNC_SCRIPT: Final[Path] = Path("scripts/sync_versions.py")
DEV_BRANCH: Final[str] = "dev"
MAIN_BRANCH: Final[str] = "main"

ANSI_RED: Final[str] = "\033[31m"
ANSI_YELLOW: Final[str] = "\033[33m"
ANSI_CYAN: Final[str] = "\033[36m"
ANSI_GREEN: Final[str] = "\033[32m"
ANSI_RESET: Final[str] = "\033[0m"


def print_error(message: str) -> None:
    print(f"{ANSI_RED}{message}{ANSI_RESET}", file=sys.stderr)


def print_warning(message: str) -> None:
    print(f"{ANSI_YELLOW}{message}{ANSI_RESET}")


def print_info(message: str) -> None:
    print(f"{ANSI_CYAN}{message}{ANSI_RESET}")


def print_success(message: str) -> None:
    print(f"{ANSI_GREEN}{message}{ANSI_RESET}")


def usage() -> str:
    return (
        "release_from_dev.py [--apply | --dryrun]\n\n"
        "Examples:\n"
        "  ./release_from_dev.py --apply\n"
        "  ./release_from_dev.py --dryrun\n"
        "  ./release_from_dev.py -h\n"
        "  ./release_from_dev.py -?\n"
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Release from dev into main with tagging.",
        usage=usage(),
        add_help=False,
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes (required for real release).",
    )
    parser.add_argument(
        "--dryrun",
        action="store_true",
        help="Print commands without executing them.",
    )
    if len(argv) == 0:
        parser.print_help()
        sys.exit(0)
    args = parser.parse_args(argv)
    if not args.apply and not args.dryrun:
        parser.print_help()
        sys.exit(0)
    return args


def ensure_beelot_directory() -> None:
    cwd = Path.cwd()
    if cwd.name != "beelot":
        raise RuntimeError("You must run this script from the ../beelot directory.")


def run_git_command(args: List[str], dryrun: bool) -> None:
    """Run a git command and abort on error."""
    printable = f"git {' '.join(args)}"
    print_info(printable)
    if dryrun:
        return
    result = subprocess.run(["git"] + args, capture_output=True, text=True)
    if result.returncode != 0:
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print_error(result.stderr.strip())
        raise RuntimeError(f"Git command failed: {printable}")
    if result.stdout.strip():
        print(result.stdout.strip())


def run_sync_versions(dryrun: bool) -> None:
    """Synchronize both version files to the maximum version."""
    command: List[str] = [
        sys.executable,
        str(SYNC_SCRIPT),
        "--source",
        "max",
    ]
    if dryrun:
        command.append("--dryrun")
    print_info("Running version sync script")
    print_info(" ".join(command))
    if dryrun:
        return
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print_error(result.stderr.strip())
        raise RuntimeError("Version synchronization failed.")
    if result.stdout.strip():
        print(result.stdout.strip())


def parse_version(
    version: str,
) -> Tuple[Tuple[int, int, int], Tuple[Tuple[int, object], ...], bool]:
    match = re.match(
        r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$",
        version,
    )
    if not match:
        raise ValueError(f"Invalid version format: {version}")

    major, minor, patch = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
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


def read_versions_from_branch(branch: str) -> Tuple[str, str]:
    """Read version strings from assets/js/version.js and package.json on a branch."""
    try:
        version_result = subprocess.run(
            ["git", "show", f"{branch}:{VERSION_FILE.as_posix()}"],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Failed to read {VERSION_FILE} from branch '{branch}': {exc}"
        ) from exc

    version_content = version_result.stdout
    match = re.search(r'export\s+const\s+VERSION\s*=\s*"([^"]+)"', version_content)
    if not match:
        raise ValueError("No version string found in version.js")
    version_js = match.group(1)

    try:
        package_result = subprocess.run(
            ["git", "show", f"{branch}:{PACKAGE_FILE.as_posix()}"],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Failed to read {PACKAGE_FILE} from branch '{branch}': {exc}"
        ) from exc

    try:
        package_json = json.loads(package_result.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"JSON parsing error in {PACKAGE_FILE} from branch '{branch}' at line {exc.lineno}, column {exc.colno}"
        ) from exc

    package_version = package_json.get("version")
    if not isinstance(package_version, str) or not package_version.strip():
        raise ValueError(f"Missing or invalid 'version' field in {PACKAGE_FILE}")

    return version_js, package_version


def ensure_clean_worktree(dryrun: bool) -> None:
    """Ensure git working tree is clean."""
    if dryrun:
        return
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stdout.strip():
        raise RuntimeError("Working tree not clean. Commit or stash changes first.")


def tag_exists(tag_name: str, dryrun: bool) -> bool:
    """Check if a tag already exists."""
    if dryrun:
        return False
    result = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", f"refs/tags/{tag_name}"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def main(argv: Sequence[str]) -> None:
    """Main release procedure."""
    try:
        args = parse_args(argv)
        ensure_beelot_directory()
        version_js, package_version = read_versions_from_branch(DEV_BRANCH)
        version = max_version(version_js, package_version)
    except Exception as exc:
        print_error(f"Error preparing release: {exc}")
        sys.exit(1)

    tag_name = f"v{version}"

    print_info(f"Releasing version {version}")

    try:
        ensure_clean_worktree(args.dryrun)

        print_info("Checking out dev branch")
        run_git_command(["checkout", DEV_BRANCH], args.dryrun)
        run_git_command(["pull"], args.dryrun)

        print_info("Checking out main branch")
        run_git_command(["checkout", MAIN_BRANCH], args.dryrun)
        run_git_command(["pull"], args.dryrun)

        print_info("Merging dev into main")
        run_git_command(["merge", DEV_BRANCH], args.dryrun)

        run_sync_versions(args.dryrun)

        print_info("Committing version update if needed")
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.stdout.strip() and not args.dryrun:
            run_git_command(["add", str(VERSION_FILE), str(PACKAGE_FILE)], args.dryrun)
            run_git_command(["commit", "-m", f"Release version {version}"], args.dryrun)
        else:
            print_warning("No version file changes to commit")

        tag_created = False
        if tag_exists(tag_name, args.dryrun):
            print_warning(f"Tag {tag_name} already exists; skipping tag creation")
        else:
            print_info(f"Creating tag {tag_name}")
            run_git_command(
                ["tag", "-a", tag_name, "-m", f"Release {version}"],
                args.dryrun,
            )
            tag_created = True

        print_info("Pushing main branch")
        run_git_command(["push"], args.dryrun)

        if tag_created:
            print_info("Pushing tags")
            run_git_command(["push", "--tags"], args.dryrun)
        else:
            print_warning("Skipping tag push; tag already existed")

        print_info("Merging main back into dev")
        run_git_command(["checkout", DEV_BRANCH], args.dryrun)
        run_git_command(["merge", MAIN_BRANCH], args.dryrun)
        run_git_command(["push"], args.dryrun)

    except Exception as exc:
        print_error(f"Release failed: {exc}")
        sys.exit(1)

    print_success("Release completed successfully")


if __name__ == "__main__":
    main(sys.argv[1:])
