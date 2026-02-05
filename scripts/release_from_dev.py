#!/usr/bin/env python3
"""Release automation script for creating a release from dev branch.

This script reads the release version from assets/js/version.js on dev,
merges dev into main, commits the version update if needed, creates
an annotated git tag, pushes changes and tags, and finally merges
main back into dev.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Final, List, Sequence


VERSION_FILE: Final[Path] = Path("assets/js/version.js")
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


def read_version_from_branch(branch: str) -> str:
    """Read version string from assets/js/version.js on a branch."""
    try:
        result = subprocess.run(
            ["git", "show", f"{branch}:{VERSION_FILE.as_posix()}"],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Failed to read {VERSION_FILE} from branch '{branch}': {exc}"
        ) from exc

    content = result.stdout
    match = re.search(r'export\s+const\s+VERSION\s*=\s*"([^"]+)"', content)
    if not match:
        raise ValueError("No version string found in version.js")

    return match.group(1)


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


def main(argv: Sequence[str]) -> None:
    """Main release procedure."""
    try:
        args = parse_args(argv)
        ensure_beelot_directory()
        version = read_version_from_branch(DEV_BRANCH)
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

        print_info("Committing version update if needed")
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.stdout.strip() and not args.dryrun:
            run_git_command(["add", str(VERSION_FILE)], args.dryrun)
            run_git_command(["commit", "-m", f"Release version {version}"], args.dryrun)
        else:
            print_warning("No version file changes to commit")

        print_info(f"Creating tag {tag_name}")
        run_git_command(["tag", "-a", tag_name, "-m", f"Release {version}"], args.dryrun)

        print_info("Pushing main branch")
        run_git_command(["push"], args.dryrun)

        print_info("Pushing tags")
        run_git_command(["push", "--tags"], args.dryrun)

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
