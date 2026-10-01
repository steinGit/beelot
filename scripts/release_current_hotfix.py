#!/usr/bin/env python3
"""
Release the current hotfix based on the version defined in assets/js/version.js.

This script extracts the version string from assets/js/version.js, confirms
with the user whether a hotfix release should be performed, and then executes
a defined sequence of git commands. A dry-run mode is available to only print
commands without executing them.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Final, List, Sequence

RED: Final[str] = "\033[31m"
RESET: Final[str] = "\033[0m"
VERSION_FILE: Final[Path] = Path("assets/js/version.js")
PACKAGE_FILE: Final[Path] = Path("package.json")
SYNC_SCRIPT: Final[Path] = Path("scripts/sync_versions.py")


def error_exit(message: str, exit_code: int = 1) -> None:
    """
    Print an error message in red and exit gracefully.

    Parameters
    ----------
    message:
        The error message to display.
    exit_code:
        The process exit code.
    """
    print(f"{RED}ERROR: {message}{RESET}", file=sys.stderr)
    sys.exit(exit_code)


def usage() -> str:
    """
    Return the usage string for the command-line help.

    Returns
    -------
    str
        Usage information including an example call.
    """
    return (
        "release_current_hotfix.py [--dryrun]\n\n"
        "Examples:\n"
        "  ./release_current_hotfix.py\n"
        "  ./release_current_hotfix.py --dryrun\n"
        "  ./release_current_hotfix.py -h\n"
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    """
    Parse command-line arguments.

    Parameters
    ----------
    argv:
        Command-line arguments.

    Returns
    -------
    argparse.Namespace
        Parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="Release the current hotfix based on assets/js/version.js",
        usage=usage(),
        add_help=False,
    )
    parser.add_argument("-h", "--help", "-?", action="help")
    parser.add_argument(
        "--dryrun",
        action="store_true",
        help="Print commands without executing them.",
    )
    return parser.parse_args(argv)


def ensure_beelot_directory() -> None:
    """
    Ensure the current working directory ends with 'beelot'.
    """
    cwd = Path.cwd()
    if cwd.name != "beelot":
        error_exit("You must run this script from the ../beelot directory.")


def get_current_branch() -> str:
    """
    Return the current git branch name.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        error_exit(f"Unable to determine current branch.\n{exc}")
    return result.stdout.strip()


def ensure_main_branch() -> None:
    """
    Ensure the current git branch is 'main'.
    """
    current_branch = get_current_branch()
    if current_branch != "main":
        error_exit(f"Current branch is '{current_branch}'. Switch to 'main' first.")


def ensure_clean_worktree() -> None:
    """Require a completely clean worktree before preparing a release."""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "Git returned an unexpected result."
        error_exit(f"Unable to inspect the working tree: {detail}")
    if result.stdout.strip():
        error_exit(
            "Working tree is not clean. Commit or stash all staged, unstaged, "
            "and untracked changes before releasing."
        )


def read_version_file(version_file: Path) -> str:
    """
    Read and extract the version string from a version.js file.

    Parameters
    ----------
    version_file:
        Path to assets/js/version.js.

    Returns
    -------
    str
        Extracted version string.

    Raises
    ------
    ValueError
        If the version string cannot be extracted.
    """
    if not version_file.exists():
        error_exit(f"Input file does not exist: {version_file}")

    if not os.access(version_file, os.R_OK):
        error_exit(f"Input file is not readable: {version_file}")

    content = version_file.read_text(encoding="utf-8")

    match = re.search(r'export\s+const\s+VERSION\s*=\s*"([^"]+)"', content)
    if match is None:
        raise ValueError("Could not extract VERSION from version.js")

    return match.group(1)


def read_package_version(package_file: Path) -> str:
    """Read the version string from package.json."""
    if not package_file.exists():
        error_exit(f"Input file does not exist: {package_file}")

    try:
        package_data = json.loads(package_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        error_exit(
            f"JSON parsing error in {package_file} at line {exc.lineno}, "
            f"column {exc.colno}: {exc.msg}"
        )
    if not isinstance(package_data, dict):
        error_exit(f"Invalid JSON structure in {package_file}: expected an object.")

    version = package_data.get("version")
    if not isinstance(version, str) or not version.strip():
        error_exit(f"Missing or invalid 'version' field in {package_file}.")
    return version


def confirm_continue(version: str) -> bool:
    """
    Ask the user whether to continue with the hotfix release.

    Parameters
    ----------
    version:
        Extracted version string.

    Returns
    -------
    bool
        True if the user confirms, False otherwise.
    """
    print(f"Extracted version: {version}")
    answer = input("Continue with hotfix release? [y/N]: ").strip().lower()
    return answer == "y"


def run_command(command: List[str], dryrun: bool) -> None:
    """
    Print and optionally execute a shell command.

    Parameters
    ----------
    command:
        Command and arguments as a list.
    dryrun:
        If True, do not execute the command.
    """
    printable = " ".join(command)
    print(printable)

    if dryrun:
        return

    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as exc:
        error_exit(f"Command failed: {printable}\n{exc}")


def sync_versions(dryrun: bool) -> None:
    """
    Synchronize package.json version from assets/js/version.js.

    Parameters
    ----------
    dryrun:
        If True, print the command only.
    """
    command: List[str] = [
        sys.executable,
        str(SYNC_SCRIPT),
        "--source",
        "version-js",
    ]
    if dryrun:
        command.append("--dryrun")
    run_command(command, dryrun=dryrun)


def main(argv: Sequence[str]) -> None:
    """
    Main entry point of the script.

    Parameters
    ----------
    argv:
        Command-line arguments.
    """
    args = parse_args(argv)

    ensure_beelot_directory()
    ensure_main_branch()
    ensure_clean_worktree()

    try:
        version = read_version_file(VERSION_FILE)
    except Exception as exc:
        error_exit(str(exc))

    if not confirm_continue(version):
        print("Aborted by user.")
        return

    package_version = read_package_version(PACKAGE_FILE)
    commands: List[List[str]] = []
    if package_version != version:
        sync_versions(dryrun=args.dryrun)
        commands.extend(
            [
                ["git", "add", str(VERSION_FILE), str(PACKAGE_FILE)],
                ["git", "commit", "-m", f"chore: bump version to {version}"],
            ]
        )
    else:
        print("Version files are already synchronized; skipping version commit.")

    commands.extend(
        [
            ["git", "tag", "-a", f"v{version}", "-m", f"Hotfix release v{version}"],
            ["git", "push", "origin", "main"],
            ["git", "push", "origin", f"v{version}"],
            ["git", "checkout", "dev"],
            ["git", "merge", "main"],
            ["git", "push", "origin", "dev"],
        ]
    )

    for cmd in commands:
        run_command(cmd, args.dryrun)


if __name__ == "__main__":
    main(sys.argv[1:])
