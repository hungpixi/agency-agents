#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${AGENCY_REPO:-https://github.com/msitarzewski/agency-agents.git}"
BRANCH="${AGENCY_BRANCH:-main}"
WORKDIR="${AGENCY_WORKDIR:-/data/agency/repo}"
OUTDIR="${AGENCY_OUTDIR:-/data/agency/current}"
RUNTIME="${AGENCY_RUNTIME:-openclaw}"

mkdir -p "$(dirname "$WORKDIR")" "$OUTDIR"

if [[ -d "$WORKDIR/.git" ]]; then
  git -C "$WORKDIR" fetch origin "$BRANCH"
  git -C "$WORKDIR" checkout "$BRANCH"
  git -C "$WORKDIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$WORKDIR"
fi

bash "$WORKDIR/scripts/convert.sh" --tool "$RUNTIME" --out "$OUTDIR/integrations"

cat > "$OUTDIR/manifest.json" <<JSON
{
  "repo": "$REPO_URL",
  "branch": "$BRANCH",
  "runtime": "$RUNTIME",
  "synced_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git -C "$WORKDIR" rev-parse HEAD)"
}
JSON

echo "agency catalog synced: $(cat "$OUTDIR/manifest.json")"
