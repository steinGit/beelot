#!/usr/bin/env bash
set -euo pipefail

PROG="$(basename "$0")"

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
  printf "%b\n" "${COLOR_ERROR}Error:${COLOR_RESET} $*" >&2
}

print_warning() {
  printf "%b\n" "${COLOR_WARNING}Warning:${COLOR_RESET} $*" >&2
}

print_info() {
  printf "%b\n" "${COLOR_INFO}Info:${COLOR_RESET} $*"
}

print_success() {
  printf "%b\n" "${COLOR_SUCCESS}Success:${COLOR_RESET} $*"
}

print_debug() {
  printf "%b\n" "${COLOR_DEBUG}Debug:${COLOR_RESET} $*"
}

show_help() {
  cat <<EOF
Usage: $PROG [OPTIONS]

Retag existing git tags and force-push them to trigger GitHub Releases.

Options:
  --pattern GLOB  Tag glob pattern (default: v*)
  --dryrun        Print intended actions without changing anything.
  --apply         Perform tag updates and push (required for changes).
  -h, --help, -?  Show this help message and exit.

Examples:
  $PROG --dryrun
  $PROG --apply
  $PROG --pattern v0.2.* --apply
EOF
}

PATTERN="v*"
DRYRUN=0
APPLY=0

if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pattern)
      PATTERN="${2:-}"
      shift 2
      ;;
    --dryrun)
      DRYRUN=1
      shift
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h|--help|-\?)
      show_help
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      show_help >&2
      exit 1
      ;;
  esac
done

if [[ "$DRYRUN" -eq 0 && "$APPLY" -eq 0 ]]; then
  show_help
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  print_error "git not found in PATH."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print_error "Not inside a git repository."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  print_error "Missing git remote 'origin'."
  exit 1
fi

print_info "Fetching tags from origin..."
if [[ "$DRYRUN" -eq 1 ]]; then
  print_debug "DRYRUN: git fetch --tags"
else
  if ! git fetch --tags; then
    print_error "Failed to fetch tags. Check network/DNS or credentials."
    exit 1
  fi
fi

tags="$(git tag -l "$PATTERN")"
if [[ -z "$tags" ]]; then
  print_warning "No tags found matching pattern: ${PATTERN}"
  exit 0
fi

print_info "Tags to retag/push:"
printf "%b\n" "${COLOR_DEBUG}${tags}${COLOR_RESET}"

if [[ "$DRYRUN" -eq 0 ]]; then
  print_warning "This will force-push tags to origin."
  read -r -p "Continue? [y/N]: " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    print_info "Aborted by user."
    exit 0
  fi
fi

while IFS= read -r tag; do
  if [[ -z "$tag" ]]; then
    continue
  fi
  if [[ "$DRYRUN" -eq 1 ]]; then
    print_debug "DRYRUN: git tag -f $tag $tag"
    print_debug "DRYRUN: git push -f origin $tag"
    continue
  fi
  print_info "Retagging ${tag}"
  git tag -f "$tag" "$tag"
  print_info "Pushing ${tag}"
  git push -f origin "$tag"
done <<< "$tags"

print_success "Done."
