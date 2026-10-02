#!/usr/bin/env bash
set -euo pipefail

PROG="$(basename "$0")"
MODE=""
ROOT_DIR="."
ARCHIVE_DIR=""

print_error() {
  printf 'ERROR: %s\n' "$*" >&2
}

print_info() {
  printf 'INFO: %s\n' "$*"
}

print_success() {
  printf 'SUCCESS: %s\n' "$*"
}

usage() {
  cat <<EOF
Usage: $PROG (--dryrun | --apply) [--root DIR] [--archive-dir DIR]

Archive editor backup files (*~ and *.bak*) while preserving their paths.
The root must be the top level of a Git repository. No files are deleted.

Options:
  --dryrun          List matching files without changing them.
  --apply           Move matching files into a reversible archive.
  --root DIR        Repository root to clean (default: current directory).
  --archive-dir DIR Archive destination (default: a unique directory in /tmp).
  -h, --help, -?    Show this help message and exit.

Examples:
  $PROG --dryrun
      Preview backup files below the current repository root.

  $PROG --apply --archive-dir /tmp/beelot-backups
      Archive backup files under a chosen destination, retaining relative paths.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dryrun|--apply)
      if [[ -n "$MODE" ]]; then
        print_error "Choose exactly one of --dryrun or --apply."
        exit 1
      fi
      MODE="$1"
      shift
      ;;
    --root)
      if [[ $# -lt 2 || -z "$2" ]]; then
        print_error "--root requires a directory."
        exit 1
      fi
      ROOT_DIR="$2"
      shift 2
      ;;
    --archive-dir)
      if [[ $# -lt 2 || -z "$2" ]]; then
        print_error "--archive-dir requires a directory."
        exit 1
      fi
      ARCHIVE_DIR="$2"
      shift 2
      ;;
    -h|--help|-?)
      usage
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  usage
  exit 0
fi

if [[ ! -d "$ROOT_DIR" ]]; then
  print_error "Repository root does not exist: $ROOT_DIR"
  exit 1
fi

ROOT_ABS="$(cd "$ROOT_DIR" && pwd -P)"
if ! GIT_ROOT="$(git -C "$ROOT_ABS" rev-parse --show-toplevel 2>/dev/null)"; then
  print_error "Expected a Git repository root: $ROOT_ABS"
  exit 1
fi
GIT_ROOT="$(cd "$GIT_ROOT" && pwd -P)"
if [[ "$ROOT_ABS" != "$GIT_ROOT" ]]; then
  print_error "Expected repository root '$GIT_ROOT', received '$ROOT_ABS'."
  exit 1
fi

mapfile -d '' -t MATCHES < <(
  find "$ROOT_ABS" -path "$ROOT_ABS/.git" -prune -o \
    -type f \( -name '*~' -o -name '*.bak*' \) -print0
)

if [[ ${#MATCHES[@]} -eq 0 ]]; then
  print_success "No editor backup files found."
  exit 0
fi

if [[ "$MODE" == "--dryrun" ]]; then
  print_info "Files that would be archived:"
  for source in "${MATCHES[@]}"; do
    printf '%s\n' "${source#"$ROOT_ABS"/}"
  done
  print_success "Dry run completed; no files changed."
  exit 0
fi

if [[ -z "$ARCHIVE_DIR" ]]; then
  TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
  ARCHIVE_ABS="$(mktemp -d "${TMPDIR:-/tmp}/beelot-cleanup_${TIMESTAMP}_XXXXXX")"
else
  ARCHIVE_ABS="$(realpath -m -- "$ARCHIVE_DIR")"
  case "$ARCHIVE_ABS/" in
    "$ROOT_ABS/"*)
      print_error "Archive directory must be outside the repository: $ARCHIVE_ABS"
      exit 1
      ;;
  esac
  mkdir -p "$ARCHIVE_DIR"
  ARCHIVE_ABS="$(cd "$ARCHIVE_DIR" && pwd -P)"
fi

case "$ARCHIVE_ABS/" in
  "$ROOT_ABS/"*)
    print_error "Archive directory must be outside the repository: $ARCHIVE_ABS"
    exit 1
    ;;
esac

for source in "${MATCHES[@]}"; do
  relative_path="${source#"$ROOT_ABS"/}"
  destination="$ARCHIVE_ABS/$relative_path"
  if [[ -e "$destination" ]]; then
    print_error "Archive destination already exists: $destination"
    exit 1
  fi
done

for source in "${MATCHES[@]}"; do
  relative_path="${source#"$ROOT_ABS"/}"
  destination="$ARCHIVE_ABS/$relative_path"
  mkdir -p "$(dirname "$destination")"
  mv -- "$source" "$destination"
done

print_success "Archived ${#MATCHES[@]} backup file(s)."
print_info "Archive directory: $ARCHIVE_ABS"
