#!/usr/bin/env python3
"""Regression tests for the release-from-dev workflow."""

from __future__ import annotations

import argparse
import importlib.util
import io
import subprocess
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import call, patch

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "release_from_dev.py"
SPEC = importlib.util.spec_from_file_location("release_from_dev", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load release script: {SCRIPT_PATH}")
release_from_dev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_from_dev)


class ReleaseVersionTests(unittest.TestCase):
    """Verify version selection after branch synchronization."""

    def test_highest_version_is_selected_from_both_branches(self) -> None:
        with patch.object(
            release_from_dev,
            "read_versions_from_branch",
            side_effect=[("1.2.0", "1.3.0"), ("2.0.0", "1.9.9")],
        ) as read_versions:
            version = release_from_dev.determine_release_version()

        self.assertEqual(version, "2.0.0")
        self.assertEqual(
            [call.args[0] for call in read_versions.call_args_list],
            [release_from_dev.DEV_BRANCH, release_from_dev.MAIN_BRANCH],
        )

    def test_main_determines_version_after_pulling_both_branches(self) -> None:
        events = []

        def record_git(args: list[str], dryrun: bool) -> None:
            events.append(("git", tuple(args), dryrun))

        def determine_version() -> str:
            events.append(("determine",))
            return "2.0.0"

        def prepare_tag(tag_name: str, dryrun: bool) -> bool:
            events.append(("tag", tag_name, dryrun))
            return False

        status_result = subprocess.CompletedProcess(
            args=["git", "status", "--porcelain"],
            returncode=0,
            stdout="",
            stderr="",
        )
        with (
            patch.object(
                release_from_dev,
                "parse_args",
                return_value=argparse.Namespace(apply=True, dryrun=False),
            ),
            patch.object(release_from_dev, "ensure_beelot_directory"),
            patch.object(release_from_dev, "ensure_clean_worktree"),
            patch.object(release_from_dev, "current_branch", return_value="dev"),
            patch.object(release_from_dev, "merge_dev_tree") as merge_dev,
            patch.object(release_from_dev, "ensure_index_matches_branch"),
            patch.object(release_from_dev, "run_git_command", side_effect=record_git),
            patch.object(
                release_from_dev,
                "determine_release_version",
                side_effect=determine_version,
            ),
            patch.object(release_from_dev, "run_sync_versions"),
            patch.object(
                release_from_dev,
                "prepare_release_tag",
                side_effect=prepare_tag,
            ),
            patch.object(
                release_from_dev.subprocess, "run", return_value=status_result
            ),
            redirect_stdout(io.StringIO()),
        ):
            release_from_dev.main(["--apply"])

        determine_index = events.index(("determine",))
        preceding_git_commands = [
            event[1] for event in events[:determine_index] if event[0] == "git"
        ]
        self.assertEqual(preceding_git_commands.count(("pull", "--ff-only")), 2)
        merge_dev.assert_called_once_with(False)
        self.assertIn(("tag", "v2.0.0", False), events)


class MergeSafetyTests(unittest.TestCase):
    """Verify dev-authoritative merge preparation and tree validation."""

    def test_merge_conflict_with_merge_head_is_resolved_by_tree_reset(self) -> None:
        results = [
            subprocess.CompletedProcess(
                args=["git", "merge"], returncode=1, stdout="CONFLICT\n", stderr=""
            ),
            subprocess.CompletedProcess(
                args=["git", "rev-parse"], returncode=0, stdout="merge-head\n", stderr=""
            ),
        ]
        with patch.object(release_from_dev.subprocess, "run", side_effect=results):
            release_from_dev.run_dev_merge(False)

    def test_merge_failure_without_merge_head_is_fatal(self) -> None:
        results = [
            subprocess.CompletedProcess(
                args=["git", "merge"], returncode=1, stdout="", stderr="fatal: failed\n"
            ),
            subprocess.CompletedProcess(
                args=["git", "rev-parse"], returncode=1, stdout="", stderr=""
            ),
        ]
        with patch.object(release_from_dev.subprocess, "run", side_effect=results):
            with self.assertRaisesRegex(RuntimeError, "Git merge failed"):
                release_from_dev.run_dev_merge(False)

    def test_merge_preparation_prefers_dev_and_resets_tree(self) -> None:
        commands = []
        with patch.object(
            release_from_dev,
            "run_git_command",
            side_effect=lambda command, dryrun: commands.append((command, dryrun)),
        ), patch.object(release_from_dev, "run_dev_merge") as run_merge:
            release_from_dev.merge_dev_tree(False)

        run_merge.assert_called_once_with(False)
        self.assertEqual(
            commands,
            [
                (["read-tree", "--reset", "-u", "dev"], False),
                (["add", "--all"], False),
            ],
        )

    def test_dryrun_merge_preparation_executes_no_git_commands(self) -> None:
        with (
            patch.object(release_from_dev, "run_git_command") as run_git,
            patch.object(release_from_dev, "run_dev_merge") as run_merge,
        ):
            release_from_dev.merge_dev_tree(True)

        run_merge.assert_called_once_with(True)
        run_git.assert_has_calls([
            call(["read-tree", "--reset", "-u", "dev"], True),
            call(["add", "--all"], True),
        ])
        self.assertEqual(run_git.call_count, 2)

    def test_tree_mismatch_is_rejected(self) -> None:
        results = [
            subprocess.CompletedProcess(
                args=["git", "write-tree"], returncode=0, stdout="staged\n", stderr=""
            ),
            subprocess.CompletedProcess(
                args=["git", "rev-parse"], returncode=0, stdout="dev-tree\n", stderr=""
            ),
        ]
        with patch.object(release_from_dev.subprocess, "run", side_effect=results):
            with self.assertRaisesRegex(RuntimeError, "Release tree mismatch"):
                release_from_dev.ensure_index_matches_branch("dev", False)


class ReleaseTagTests(unittest.TestCase):
    """Verify that release tags are checked before creation or pushing."""

    def test_remote_lookup_failure_is_fatal(self) -> None:
        result = subprocess.CompletedProcess(
            args=["git", "ls-remote"],
            returncode=2,
            stdout="",
            stderr="network unavailable",
        )
        with patch.object(release_from_dev.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "network unavailable"):
                release_from_dev.remote_tag_target("v2.0.0")

    def test_annotated_remote_tag_resolves_to_its_peeled_commit(self) -> None:
        result = subprocess.CompletedProcess(
            args=["git", "ls-remote"],
            returncode=0,
            stdout=(
                "tag-object\trefs/tags/v2.0.0\n" "release-commit\trefs/tags/v2.0.0^{}\n"
            ),
            stderr="",
        )
        with patch.object(release_from_dev.subprocess, "run", return_value=result):
            target = release_from_dev.remote_tag_target("v2.0.0")

        self.assertEqual(target, "release-commit")

    def test_existing_tag_must_target_release_commit(self) -> None:
        with (
            patch.object(release_from_dev, "current_head_commit", return_value="new"),
            patch.object(release_from_dev, "local_tag_target", return_value="old"),
            patch.object(release_from_dev, "remote_tag_target", return_value=None),
        ):
            with self.assertRaisesRegex(RuntimeError, "expected new"):
                release_from_dev.prepare_release_tag("v2.0.0", False)

    def test_verified_local_tag_is_pushed_when_remote_tag_is_missing(self) -> None:
        with (
            patch.object(
                release_from_dev, "current_head_commit", return_value="release"
            ),
            patch.object(release_from_dev, "local_tag_target", return_value="release"),
            patch.object(release_from_dev, "remote_tag_target", return_value=None),
            patch.object(release_from_dev, "run_git_command") as run_git,
            redirect_stdout(io.StringIO()),
        ):
            needs_push = release_from_dev.prepare_release_tag("v2.0.0", False)

        self.assertTrue(needs_push)
        run_git.assert_not_called()

    def test_matching_remote_tag_does_not_need_another_push(self) -> None:
        with (
            patch.object(
                release_from_dev, "current_head_commit", return_value="release"
            ),
            patch.object(release_from_dev, "local_tag_target", return_value=None),
            patch.object(release_from_dev, "remote_tag_target", return_value="release"),
            patch.object(release_from_dev, "run_git_command") as run_git,
            redirect_stdout(io.StringIO()),
        ):
            needs_push = release_from_dev.prepare_release_tag("v2.0.0", False)

        self.assertFalse(needs_push)
        run_git.assert_not_called()

    def test_missing_tag_is_created_and_marked_for_push(self) -> None:
        with (
            patch.object(
                release_from_dev, "current_head_commit", return_value="release"
            ),
            patch.object(release_from_dev, "local_tag_target", return_value=None),
            patch.object(release_from_dev, "remote_tag_target", return_value=None),
            patch.object(release_from_dev, "run_git_command") as run_git,
            redirect_stdout(io.StringIO()),
        ):
            needs_push = release_from_dev.prepare_release_tag("v2.0.0", False)

        self.assertTrue(needs_push)
        run_git.assert_called_once_with(
            ["tag", "-a", "v2.0.0", "-m", "Release 2.0.0"],
            False,
        )


if __name__ == "__main__":
    unittest.main()
