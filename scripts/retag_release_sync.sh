#!/usr/bin/env bash
set -euo pipefail

PROG="$(basename "$0")"
PATTERN="v*"
MODE=""

COLOR_RESET=""
COLOR_ERROR=""
COLOR_WARNING=""
COLOR_INFO=""
COLOR_SUCCESS=""
COLOR_DEBUG=""

if [[ -t 1 ]]; then
  COLOR_RESET=$'\033[0m'
  COLOR_ERROR=$'\033[31m'
  COLOR_WARNING=$'\033[33m'
  COLOR_INFO=$'\033[36m'
  COLOR_SUCCESS=$'\033[32m'
  COLOR_DEBUG=$'\033[90m'
fi

print_error() {
  printf '%b\n' "${COLOR_ERROR}ERROR:${COLOR_RESET} $*" >&2
}

print_warning() {
  printf '%b\n' "${COLOR_WARNING}WARNING:${COLOR_RESET} $*" >&2
}

print_info() {
  printf '%b\n' "${COLOR_INFO}INFO:${COLOR_RESET} $*"
}

print_success() {
  printf '%b\n' "${COLOR_SUCCESS}SUCCESS:${COLOR_RESET} $*"
}

print_debug() {
  printf '%b\n' "${COLOR_DEBUG}DEBUG:${COLOR_RESET} $*"
}

usage() {
  cat <<EOF
Usage: $PROG (--dryrun | --apply) [--pattern GLOB]

Recreate existing release tags as annotated tags on the same commits and push
them with an exact force-with-lease guard. Local and remote tag targets must
match before any tag is changed.

Options:
  --pattern GLOB  Tag glob pattern (default: v*).
  --dryrun        Validate tags and print commands without changing anything.
  --apply         Recreate and safely push the selected tags.
  -h, --help, -?  Show this help message and exit.

Examples:
  $PROG --dryrun
      Validate all v* tags and preview the guarded retag operation.

  $PROG --pattern 'v0.3.*' --apply
      Recreate matching tags after confirmation and update only unchanged refs.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pattern)
      if [[ $# -lt 2 || -z "$2" ]]; then
        print_error "--pattern requires a non-empty glob."
        exit 1
      fi
      PATTERN="$2"
      shift 2
      ;;
    --dryrun|--apply)
      if [[ -n "$MODE" ]]; then
        print_error "Choose exactly one of --dryrun or --apply."
        exit 1
      fi
      MODE="$1"
      shift
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

if ! command -v git >/dev/null 2>&1; then
  print_error "git not found in PATH."
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print_error "Not inside a Git repository."
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  print_error "Missing Git remote 'origin'."
  exit 1
fi

mapfile -t TAGS < <(git tag -l "$PATTERN")
if [[ ${#TAGS[@]} -eq 0 ]]; then
  print_warning "No tags found matching pattern: $PATTERN"
  exit 0
fi

declare -a TARGET_COMMITS=()
declare -a REMOTE_OBJECTS=()

print_info "Validating local and remote tag targets..."
for tag in "${TAGS[@]}"; do
  if ! target_commit="$(git rev-list -n 1 "$tag")" || [[ -z "$target_commit" ]]; then
    print_error "Failed to resolve local tag: $tag"
    exit 1
  fi

  direct_ref="refs/tags/$tag"
  peeled_ref="$direct_ref^{}"
  if ! remote_output="$(git ls-remote --tags origin "$direct_ref" "$peeled_ref")"; then
    print_error "Failed to inspect remote tag: $tag"
    exit 1
  fi

  remote_object=""
  remote_target=""
  while read -r object_id ref_name; do
    if [[ "$ref_name" == "$direct_ref" ]]; then
      remote_object="$object_id"
    elif [[ "$ref_name" == "$peeled_ref" ]]; then
      remote_target="$object_id"
    fi
  done <<< "$remote_output"

  if [[ -z "$remote_object" ]]; then
    print_error "Remote tag does not exist: $tag"
    exit 1
  fi
  if [[ -z "$remote_target" ]]; then
    remote_target="$remote_object"
  fi
  if [[ "$remote_target" != "$target_commit" ]]; then
    print_error "Tag target mismatch for $tag: local=$target_commit remote=$remote_target"
    exit 1
  fi

  TARGET_COMMITS+=("$target_commit")
  REMOTE_OBJECTS+=("$remote_object")
done

print_info "Validated ${#TAGS[@]} tag(s) matching '$PATTERN'."
if [[ "$MODE" == "--apply" ]]; then
  print_warning "Selected remote tag objects will be replaced on their existing commits."
  read -r -p "Continue? [y/N]: " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    print_info "Aborted by user."
    exit 0
  fi
fi

for index in "${!TAGS[@]}"; do
  tag="${TAGS[$index]}"
  target_commit="${TARGET_COMMITS[$index]}"
  remote_object="${REMOTE_OBJECTS[$index]}"
  lease="--force-with-lease=refs/tags/$tag:$remote_object"
  message="Retrigger release $tag at $(date -u +'%Y-%m-%dT%H:%M:%S.%N%z')"

  if [[ "$MODE" == "--dryrun" ]]; then
    print_debug "DRYRUN: git tag -f -a $tag $target_commit -m '$message'"
    print_debug "DRYRUN: git push $lease origin refs/tags/$tag"
    continue
  fi

  print_info "Recreating $tag on $target_commit"
  git tag -f -a "$tag" "$target_commit" -m "$message"
  print_info "Pushing $tag with an exact lease"
  git push "$lease" origin "refs/tags/$tag"
done

print_success "Retag operation completed."
