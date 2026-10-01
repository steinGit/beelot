#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
TMP_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

REPO_DIR="$TMP_ROOT/beelot"
ARCHIVE_DIR="$TMP_ROOT/archive"
mkdir -p "$REPO_DIR/one" "$REPO_DIR/two/nested"
git -C "$REPO_DIR" init -q
printf 'first\n' > "$REPO_DIR/one/shared.bak"
printf 'second\n' > "$REPO_DIR/two/nested/shared.bak.1"
printf 'editor\n' > "$REPO_DIR/two/note.txt~"
printf 'keep\n' > "$REPO_DIR/keep.txt"

bash "$PROJECT_ROOT/scripts/cleanup.sh" --dryrun --root "$REPO_DIR" >/dev/null
[[ -f "$REPO_DIR/one/shared.bak" ]]
[[ -f "$REPO_DIR/two/nested/shared.bak.1" ]]
[[ -f "$REPO_DIR/two/note.txt~" ]]

if bash "$PROJECT_ROOT/scripts/cleanup.sh" \
  --apply \
  --root "$REPO_DIR" \
  --archive-dir "$REPO_DIR/unsafe-archive" >/dev/null 2>&1; then
  printf 'Expected cleanup to reject an archive inside the repository.\n' >&2
  exit 1
fi
[[ ! -e "$REPO_DIR/unsafe-archive" ]]

bash "$PROJECT_ROOT/scripts/cleanup.sh" \
  --apply \
  --root "$REPO_DIR" \
  --archive-dir "$ARCHIVE_DIR" >/dev/null

[[ ! -e "$REPO_DIR/one/shared.bak" ]]
[[ ! -e "$REPO_DIR/two/nested/shared.bak.1" ]]
[[ ! -e "$REPO_DIR/two/note.txt~" ]]
[[ -f "$ARCHIVE_DIR/one/shared.bak" ]]
[[ -f "$ARCHIVE_DIR/two/nested/shared.bak.1" ]]
[[ -f "$ARCHIVE_DIR/two/note.txt~" ]]
[[ -f "$REPO_DIR/keep.txt" ]]

if bash "$PROJECT_ROOT/scripts/cleanup.sh" \
  --dryrun \
  --root "$REPO_DIR/one" >/dev/null 2>&1; then
  printf 'Expected cleanup to reject a repository subdirectory.\n' >&2
  exit 1
fi

printf 'OK\n'
