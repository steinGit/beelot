#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
TMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

REMOTE_DIR="$TMP_ROOT/remote.git"
WORK_DIR="$TMP_ROOT/work"
git init -q --bare "$REMOTE_DIR"
git init -q "$WORK_DIR"
git -C "$WORK_DIR" config user.name "BeeLot Test"
git -C "$WORK_DIR" config user.email "beelot-test@example.invalid"
git -C "$WORK_DIR" remote add origin "$REMOTE_DIR"
printf 'release\n' > "$WORK_DIR/release.txt"
git -C "$WORK_DIR" add release.txt
git -C "$WORK_DIR" commit -q -m "Initial release"
RELEASE_COMMIT="$(git -C "$WORK_DIR" rev-parse HEAD)"
git -C "$WORK_DIR" tag -a v1.0.0 -m "Release 1.0.0"
git -C "$WORK_DIR" push -q origin HEAD v1.0.0

remote_tag_object() {
  git -C "$WORK_DIR" ls-remote --tags origin refs/tags/v1.0.0 | awk '{print $1}'
}

BEFORE_OBJECT="$(remote_tag_object)"
(
  cd "$WORK_DIR"
  bash "$PROJECT_ROOT/scripts/retag_release_sync.sh" --dryrun >/dev/null
)
[[ "$(remote_tag_object)" == "$BEFORE_OBJECT" ]]

(
  cd "$WORK_DIR"
  printf 'y\n' | bash "$PROJECT_ROOT/scripts/retag_release_sync.sh" --apply >/dev/null
)
AFTER_OBJECT="$(remote_tag_object)"
[[ "$AFTER_OBJECT" != "$BEFORE_OBJECT" ]]
REMOTE_TARGET="$(
  git -C "$WORK_DIR" ls-remote --tags origin 'refs/tags/v1.0.0^{}' | awk '{print $1}'
)"
[[ "$REMOTE_TARGET" == "$RELEASE_COMMIT" ]]

printf 'later\n' >> "$WORK_DIR/release.txt"
git -C "$WORK_DIR" commit -qam "Later commit"
git -C "$WORK_DIR" tag -f v1.0.0 >/dev/null
UNCHANGED_REMOTE_OBJECT="$(remote_tag_object)"
if (
  cd "$WORK_DIR"
  printf 'y\n' | bash "$PROJECT_ROOT/scripts/retag_release_sync.sh" --apply >/dev/null 2>&1
); then
  printf 'Expected mismatched local and remote tag targets to be rejected.\n' >&2
  exit 1
fi
[[ "$(remote_tag_object)" == "$UNCHANGED_REMOTE_OBJECT" ]]

printf 'OK\n'
