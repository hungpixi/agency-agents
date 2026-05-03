#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="$DATA_DIR/db.json"
MARKER_PATH="$DATA_DIR/.restore-sha256"

mkdir -p "$DATA_DIR"

if [ "${NINE_ROUTER_RESTORE_BACKUP:-true}" = "true" ] && [ -n "${NINE_ROUTER_DB_JSON_BASE64:-}" ]; then
  current_marker=""
  if [ -s "$MARKER_PATH" ]; then
    current_marker="$(cat "$MARKER_PATH")"
  fi
  if [ ! -s "$DB_PATH" ] || [ "${NINE_ROUTER_FORCE_RESTORE:-false}" = "true" ] || [ "${NINE_ROUTER_DB_JSON_SHA256:-}" != "$current_marker" ]; then
    tmp="$DB_PATH.tmp"
    printf '%s' "$NINE_ROUTER_DB_JSON_BASE64" | base64 -d > "$tmp"
    mv "$tmp" "$DB_PATH"
    printf '%s' "${NINE_ROUTER_DB_JSON_SHA256:-unknown}" > "$MARKER_PATH"
  fi
fi

exec "$@"
