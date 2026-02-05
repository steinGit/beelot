#!/usr/bin/env bash

set -euo pipefail

PROG="$(basename "$0")"

COLOR_RESET=""
COLOR_ERROR=""
COLOR_WARN=""
COLOR_INFO=""
COLOR_SUCCESS=""
COLOR_DEBUG=""

if [[ -t 1 ]]; then
  COLOR_RESET=$'\033[0m'
  COLOR_ERROR=$'\033[31m'
  COLOR_WARN=$'\033[33m'
  COLOR_INFO=$'\033[36m'
  COLOR_SUCCESS=$'\033[32m'
  COLOR_DEBUG=$'\033[90m'
fi

print_error() {
  printf "%b\n" "${COLOR_ERROR}Error:${COLOR_RESET} $*" >&2
}

print_warn() {
  printf "%b\n" "${COLOR_WARN}Warning:${COLOR_RESET} $*" >&2
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

Compares local branches "main" and the current branch using:
  git log --oneline --left-right main...<current>

Options:
  -h, --help, -?  Show this help message and exit.

Examples:
  $PROG
  $PROG -h
  $PROG -?
EOF
}

if [[ $# -gt 0 ]]; then
  case "${1:-}" in
    -h|--help|-\?)
      show_help
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      exit 1
      ;;
  esac
fi

if ! command -v git >/dev/null 2>&1; then
  print_error "git not found in PATH."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print_error "Not inside a git repository."
  exit 1
fi

MAIN_BRANCH="main"
CURRENT_BRANCH="$(git symbolic-ref -q --short HEAD || true)"

if [[ -z "$CURRENT_BRANCH" ]]; then
  print_error "Detached HEAD state detected. Please checkout a branch first."
  exit 1
fi
if [[ "$CURRENT_BRANCH" == "$MAIN_BRANCH" ]]; then
  print_warn "Current branch is ${MAIN_BRANCH}. Comparison would be identical."
  exit 0
fi

if ! git show-ref --verify --quiet "refs/heads/${MAIN_BRANCH}"; then
  print_error "Missing local branch: ${MAIN_BRANCH}"
  exit 1
fi

log_output="$(git log --oneline --left-right "${MAIN_BRANCH}...${CURRENT_BRANCH}")"
if [[ -z "$log_output" ]]; then
  print_success "Both are identical."
  exit 0
fi

left_count="$(printf "%s\n" "$log_output" | grep -c "^< " || true)"
right_count="$(printf "%s\n" "$log_output" | grep -c "^> " || true)"

print_info "Differences between ${MAIN_BRANCH} (left) and ${CURRENT_BRANCH} (right):"
printf "%b\n" "${COLOR_DEBUG}main only: ${left_count} | ${CURRENT_BRANCH} only: ${right_count}${COLOR_RESET}"

while IFS= read -r line; do
  case "$line" in
    "< "*)
      printf "%b\n" "${COLOR_WARN}< ${MAIN_BRANCH}${COLOR_RESET} ${line#< }"
      ;;
    "> "*)
      printf "%b\n" "${COLOR_INFO}> ${CURRENT_BRANCH}${COLOR_RESET} ${line#> }"
      ;;
    *)
      printf "%s\n" "$line"
      ;;
  esac
done <<< "$log_output"
