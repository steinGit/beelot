#!/usr/bin/env python3
"""Regression tests for the current-hotfix release workflow."""

from __future__ import annotations

import argparse
import importlib.util
import io
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "release_current_hotfix.py"
SPEC = importlib.util.spec_from_file_location("release_current_hotfix", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load hotfix release script: {SCRIPT_PATH}")
release_current_hotfix = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_current_hotfix)


class HotfixPreparationTests(unittest.TestCase):
    """Verify that preparation is safe and happens in the intended order."""

    def test_staged_change_fails_the_clean_worktree_check(self) -> None:
        result = subprocess.CompletedProcess(
            args=["git", "status", "--porcelain"],
            returncode=0,
            stdout="M  unrelated.txt\n",
            stderr="",
        )
        with (
            patch.object(
                release_current_hotfix.subprocess,
                "run",
                return_value=result,
            ),
            redirect_stderr(io.StringIO()),
        ):
            with self.assertRaises(SystemExit):
                release_current_hotfix.ensure_clean_worktree()

    def test_declining_confirmation_does_not_modify_anything(self) -> None:
        with (
            patch.object(
                release_current_hotfix,
                "parse_args",
                return_value=argparse.Namespace(dryrun=False),
            ),
            patch.object(release_current_hotfix, "ensure_beelot_directory"),
            patch.object(release_current_hotfix, "ensure_main_branch"),
            patch.object(release_current_hotfix, "ensure_clean_worktree"),
            patch.object(
                release_current_hotfix,
                "read_version_file",
                return_value="1.2.3",
            ),
            patch.object(
                release_current_hotfix,
                "confirm_continue",
                return_value=False,
            ),
            patch.object(
                release_current_hotfix, "read_package_version"
            ) as read_package,
            patch.object(release_current_hotfix, "sync_versions") as sync_versions,
            patch.object(release_current_hotfix, "run_command") as run_command,
            redirect_stdout(io.StringIO()),
        ):
            release_current_hotfix.main([])

        read_package.assert_not_called()
        sync_versions.assert_not_called()
        run_command.assert_not_called()

    def test_confirmation_precedes_version_sync_and_commit(self) -> None:
        events = []

        def confirm(version: str) -> bool:
            events.append(("confirm", version))
            return True

        def ensure_clean() -> None:
            events.append(("clean",))

        def read_package(package_file: Path) -> str:
            events.append(("read-package", package_file))
            return "1.2.2"

        def sync(dryrun: bool) -> None:
            events.append(("sync", dryrun))

        def run(command: list[str], dryrun: bool) -> None:
            events.append(("run", tuple(command), dryrun))

        with (
            patch.object(
                release_current_hotfix,
                "parse_args",
                return_value=argparse.Namespace(dryrun=False),
            ),
            patch.object(release_current_hotfix, "ensure_beelot_directory"),
            patch.object(release_current_hotfix, "ensure_main_branch"),
            patch.object(
                release_current_hotfix,
                "ensure_clean_worktree",
                side_effect=ensure_clean,
            ),
            patch.object(
                release_current_hotfix,
                "read_version_file",
                return_value="1.2.3",
            ),
            patch.object(
                release_current_hotfix,
                "confirm_continue",
                side_effect=confirm,
            ),
            patch.object(
                release_current_hotfix,
                "read_package_version",
                side_effect=read_package,
            ),
            patch.object(release_current_hotfix, "sync_versions", side_effect=sync),
            patch.object(release_current_hotfix, "run_command", side_effect=run),
            redirect_stdout(io.StringIO()),
        ):
            release_current_hotfix.main([])

        clean_index = events.index(("clean",))
        confirm_index = events.index(("confirm", "1.2.3"))
        sync_index = events.index(("sync", False))
        self.assertLess(clean_index, confirm_index)
        self.assertLess(confirm_index, sync_index)
        commands = [event[1] for event in events if event[0] == "run"]
        self.assertEqual(
            commands[:2],
            [
                ("git", "add", "assets/js/version.js", "package.json"),
                ("git", "commit", "-m", "chore: bump version to 1.2.3"),
            ],
        )

    def test_synchronized_versions_skip_the_version_commit(self) -> None:
        commands = []

        def run(command: list[str], dryrun: bool) -> None:
            commands.append((tuple(command), dryrun))

        with (
            patch.object(
                release_current_hotfix,
                "parse_args",
                return_value=argparse.Namespace(dryrun=False),
            ),
            patch.object(release_current_hotfix, "ensure_beelot_directory"),
            patch.object(release_current_hotfix, "ensure_main_branch"),
            patch.object(release_current_hotfix, "ensure_clean_worktree"),
            patch.object(
                release_current_hotfix,
                "read_version_file",
                return_value="1.2.3",
            ),
            patch.object(
                release_current_hotfix,
                "confirm_continue",
                return_value=True,
            ),
            patch.object(
                release_current_hotfix,
                "read_package_version",
                return_value="1.2.3",
            ),
            patch.object(release_current_hotfix, "sync_versions") as sync_versions,
            patch.object(release_current_hotfix, "run_command", side_effect=run),
            redirect_stdout(io.StringIO()),
        ):
            release_current_hotfix.main([])

        sync_versions.assert_not_called()
        self.assertEqual(commands[0][0][:3], ("git", "tag", "-a"))
        self.assertFalse(
            any(command[:2] == ("git", "commit") for command, _ in commands)
        )

    def test_package_json_error_reports_file_line_and_column(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            package_file = Path(temp_dir) / "package.json"
            package_file.write_text('{\n  "version":\n}', encoding="utf-8")
            error_output = io.StringIO()

            with redirect_stderr(error_output):
                with self.assertRaises(SystemExit):
                    release_current_hotfix.read_package_version(package_file)

        message = error_output.getvalue()
        self.assertIn(str(package_file), message)
        self.assertIn("line", message)
        self.assertIn("column", message)


if __name__ == "__main__":
    unittest.main()
