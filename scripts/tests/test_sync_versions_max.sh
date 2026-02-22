#!/usr/bin/env bash
set -euo pipefail

PROG="$(basename "$0")"
KEEP_TMP=0

show_help() {
  cat <<EOF
Usage: $PROG [OPTIONS]

Options:
  --keep-tmp     Keep temporary directory for inspection.
  -h, --help, -? Show this help message and exit.

Examples:
  $PROG
  $PROG --keep-tmp
  $PROG -h
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-tmp)
      KEEP_TMP=1
      shift
      ;;
    -h|--help|-\?)
      show_help
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      show_help >&2
      exit 1
      ;;
  esac
done

TMP_DIR="$(mktemp -d)"
cleanup() {
  if [[ "$KEEP_TMP" -eq 0 ]]; then
    rm -rf "$TMP_DIR"
  else
    echo "Keeping temp dir: $TMP_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/assets/js"

cat > "$TMP_DIR/assets/js/version.js" <<'EOF'
// assets/js/version.js
export const VERSION = "0.2.1";
EOF

cat > "$TMP_DIR/package.json" <<'EOF'
{
  "name": "beelot-test",
  "version": "0.2.2"
}
EOF

pushd "$TMP_DIR" >/dev/null
python3 /home/stein/prj/beelot/scripts/sync_versions.py --source max >/dev/null
popd >/dev/null

if ! grep -q 'VERSION = "0.2.2"' "$TMP_DIR/assets/js/version.js"; then
  echo "Expected version.js to be updated to 0.2.2" >&2
  cat "$TMP_DIR/assets/js/version.js" >&2
  exit 1
fi

if ! grep -q '"version": "0.2.2"' "$TMP_DIR/package.json"; then
  echo "Expected package.json to be updated to 0.2.2" >&2
  cat "$TMP_DIR/package.json" >&2
  exit 1
fi

echo "OK"
