#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="$DATA_DIR/db.json"

mkdir -p "$DATA_DIR"

if [ "${NINE_ROUTER_RESTORE_BACKUP:-true}" = "true" ] && [ -n "${NINE_ROUTER_DB_JSON_BASE64:-}" ]; then
  if [ ! -s "$DB_PATH" ] || [ "${NINE_ROUTER_FORCE_RESTORE:-false}" = "true" ]; then
    tmp="$DB_PATH.tmp"
    printf '%s' "$NINE_ROUTER_DB_JSON_BASE64" | base64 -d > "$tmp"
    mv "$tmp" "$DB_PATH"
  fi
fi

exec "$@"
