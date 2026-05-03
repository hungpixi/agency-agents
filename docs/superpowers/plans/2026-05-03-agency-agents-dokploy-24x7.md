# Agency Agents Dokploy 24x7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `msitarzewski/agency-agents` into a Dokploy-hosted, always-on agency workbench that keeps the agent catalog fresh and exposes a controlled runtime for one-person-company workflows.

**Architecture:** Treat `agency-agents` as the source catalog of agent prompts, not as a standalone server. Deploy a small control-plane container around it that converts agents, publishes them into the selected runtime format, exposes health/status endpoints, and optionally triggers OpenClaw/OpenCode/Codex jobs through a queue.

**Tech Stack:** Dokploy, Docker, Bash, GitHub CLI, OpenClaw or OpenCode runtime, optional Redis queue, optional Postgres for job history, provider API keys stored as Dokploy secrets.

---

## Current Repo Facts

- Upstream repo: `https://github.com/msitarzewski/agency-agents`
- Default branch: `main`
- Latest checked update: `2026-05-03T02:00:01Z`
- License: MIT
- Local path: `D:\code\agents-agency`
- The repo is a prompt/agent catalog with conversion and install scripts. It is not an API service and does not include Dockerfile, compose, package.json, pyproject, or server process.
- `scripts/convert.sh --tool openclaw --out /tmp/agency-agents-openclaw-test` succeeds and converts 184 agents.
- `scripts/convert.sh --tool opencode --out /tmp/agency-agents-opencode-test` succeeds and converts 184 agents.
- `scripts/lint-agents.sh` currently fails with 16 errors because it scans strategy documentation files that intentionally do not have agent frontmatter. This should not block deployment if `convert.sh` is used as the deployment validation gate.
- OpenClaw official docs list Node 24 as recommended, `npm install -g openclaw@latest` as a supported install path, `openclaw gateway status` as the gateway verification command, and gateway port `18789` as the usual WebSocket port.

## Recommended Product Shape

Deploy this as three layers:

1. **Catalog Syncer**
   Pulls upstream, runs `scripts/convert.sh`, and writes converted agent packs into a persistent volume.

2. **Agent Runtime**
   Runs OpenClaw gateway if the goal is a long-lived agent gateway, or OpenCode/Codex sessions if the goal is project-scoped coding jobs. For Dokploy 24/24, OpenClaw is the better first runtime because the repo already outputs `SOUL.md`, `AGENTS.md`, and `IDENTITY.md` workspaces and documents `openclaw gateway restart`.

3. **OPC Control Plane**
   A small web/API service with:
   - `GET /healthz`
   - `GET /agents`
   - `POST /jobs`
   - `GET /jobs/:id`
   - `POST /sync`
   - token budget limits per job
   - allowlisted agent packs
   - logs and artifacts stored on a mounted volume

## Dokploy Target Topology

Services:

- `agency-catalog`
  - Type: Docker app
  - Purpose: clone/pull/convert `agency-agents`
  - Mount: `/data/agency`
  - Health: file exists at `/data/agency/current/manifest.json`

- `agency-runtime`
  - Type: Docker app
  - Purpose: run OpenClaw gateway or chosen agent runtime
  - Mount: `/data/agency` read-only plus `/data/runtime` read-write
  - Health: `GET /healthz`

- `agency-api`
  - Type: Docker app
  - Purpose: expose job API, budget guardrails, job status, and manual sync trigger
  - Mount: `/data/agency` read-only plus `/data/jobs` read-write
  - Health: `GET /healthz`

- `redis`
  - Type: Dokploy database/addon or container
  - Purpose: job queue and rate limits

- `postgres`
  - Type: Dokploy database/addon
  - Purpose: job metadata, audit trail, spend ledger

## Secret Model

Create these Dokploy environment variables:

```bash
GITHUB_TOKEN=<optional-github-token>
AGENCY_REPO=https://github.com/msitarzewski/agency-agents.git
AGENCY_BRANCH=main
AGENCY_RUNTIME=openclaw
AGENCY_SYNC_INTERVAL_SECONDS=3600
AGENCY_MAX_PARALLEL_JOBS=3
AGENCY_MAX_TOKENS_PER_JOB=250000
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_GATEWAY_TOKEN=generate_a_32_byte_random_token
OPENAI_API_KEY=<optional-openai-api-key>
ANTHROPIC_API_KEY=<optional-anthropic-api-key>
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql://agency:agency_password@postgres:5432/agency
CONTROL_PLANE_TOKEN=generate_a_32_byte_random_token
```

For the first launch, set `AGENCY_MAX_PARALLEL_JOBS=1` until cost and failure behavior are visible in logs.

## Milestone 1: Local Reproducible Setup

**Files:**
- Modify: `README.md`
- Create: `docs/deployment/dokploy.md`
- Create: `deploy/agency-catalog/sync.sh`
- Create: `deploy/agency-catalog/Dockerfile`

- [ ] **Step 1: Document the repo role**

Add a short deployment note to `README.md` explaining that this repo is an agent catalog, not a daemon.

- [ ] **Step 2: Create catalog sync script**

Create `deploy/agency-catalog/sync.sh`:

```bash
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
```

- [ ] **Step 3: Create catalog Dockerfile**

Create `deploy/agency-catalog/Dockerfile`:

```dockerfile
FROM alpine:3.20

RUN apk add --no-cache bash git jq curl

WORKDIR /app
COPY deploy/agency-catalog/sync.sh /app/sync.sh
RUN chmod +x /app/sync.sh

CMD ["/bin/bash", "-lc", "while true; do /app/sync.sh; sleep ${AGENCY_SYNC_INTERVAL_SECONDS:-3600}; done"]
```

- [ ] **Step 4: Verify locally**

Run:

```bash
docker build -f deploy/agency-catalog/Dockerfile -t agency-catalog .
docker run --rm -e AGENCY_RUNTIME=openclaw -v agency_catalog_test:/data/agency agency-catalog
```

Expected:

```text
Converted 184 agents for openclaw
manifest.json exists in /data/agency/current
```

## Milestone 2: Runtime Choice

**Files:**
- Create: `docs/deployment/runtime-choice.md`
- Create: `deploy/agency-runtime/Dockerfile`
- Create: `deploy/agency-runtime/entrypoint.sh`

- [ ] **Step 1: Pick runtime**

Use OpenClaw first if the operational goal is a long-running gateway. Use OpenCode first if the operational goal is project-scoped coding jobs launched from a separate scheduler.

- [ ] **Step 2: Create runtime entrypoint**

Create `deploy/agency-runtime/entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RUNTIME="${AGENCY_RUNTIME:-openclaw}"

if [[ "$RUNTIME" == "openclaw" ]]; then
  mkdir -p "$HOME/.openclaw/agency-agents"
  if [[ -d /data/agency/current/integrations/openclaw ]]; then
    cp -R /data/agency/current/integrations/openclaw/. "$HOME/.openclaw/agency-agents/"
  fi
  mkdir -p "$HOME/.openclaw"
  cat > "$HOME/.openclaw/openclaw.json" <<JSON
{
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
JSON
  OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}" openclaw gateway --port "${OPENCLAW_GATEWAY_PORT:-18789}" --force
else
  echo "Unsupported runtime: $RUNTIME"
  exit 1
fi
```

- [ ] **Step 3: Create runtime Dockerfile**

Create `deploy/agency-runtime/Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git bash curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest

WORKDIR /app
COPY deploy/agency-runtime/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789
CMD ["/app/entrypoint.sh"]
```

- [ ] **Step 4: Verify runtime container**

Run:

```bash
docker build -f deploy/agency-runtime/Dockerfile -t agency-runtime .
docker run --rm -p 18789:18789 -e OPENCLAW_GATEWAY_TOKEN=local-dev-token -v agency_catalog_test:/data/agency agency-runtime
```

Expected:

```text
OpenClaw gateway status returns healthy for ws://127.0.0.1:18789
```

## Milestone 3: OPC Control Plane

**Files:**
- Create: `apps/control-plane/package.json`
- Create: `apps/control-plane/src/server.ts`
- Create: `apps/control-plane/src/agents.ts`
- Create: `apps/control-plane/src/jobs.ts`
- Create: `apps/control-plane/Dockerfile`

- [ ] **Step 1: Create minimal API**

Implement:

```text
GET /healthz -> { "ok": true }
GET /agents -> reads converted agent directories from /data/agency/current/integrations/openclaw
POST /jobs -> accepts { "agent": "backend-architect", "prompt": "..." }
GET /jobs/:id -> returns queued, running, succeeded, failed
POST /sync -> protected by CONTROL_PLANE_TOKEN
```

- [ ] **Step 2: Add budget guardrails**

Reject jobs when:

```text
prompt is larger than 20000 characters
AGENCY_MAX_PARALLEL_JOBS is exceeded
agent is not in the allowlist
estimated token cost exceeds AGENCY_MAX_TOKENS_PER_JOB
```

- [ ] **Step 3: Add durable artifacts**

Write each job to:

```text
/data/jobs/<job-id>/request.json
/data/jobs/<job-id>/stdout.log
/data/jobs/<job-id>/stderr.log
/data/jobs/<job-id>/result.md
```

- [ ] **Step 4: Verify API locally**

Run:

```bash
docker build -f apps/control-plane/Dockerfile -t agency-api .
docker run --rm -p 8090:8090 -v agency_catalog_test:/data/agency -v agency_jobs_test:/data/jobs agency-api
curl http://localhost:8090/healthz
curl http://localhost:8090/agents
```

Expected:

```text
healthz returns ok
agents returns converted OpenClaw agent IDs
```

## Milestone 4: Dokploy Deployment

**Files:**
- Create: `docs/deployment/dokploy.md`
- Create: `deploy/dokploy.env.example`

- [ ] **Step 1: Create Dokploy project**

Create project `agency-agents-opc`.

- [ ] **Step 2: Add persistent volumes**

Create:

```text
agency_catalog -> /data/agency
agency_runtime -> /data/runtime
agency_jobs -> /data/jobs
```

- [ ] **Step 3: Deploy catalog**

Use Dockerfile path:

```text
deploy/agency-catalog/Dockerfile
```

Set:

```text
AGENCY_RUNTIME=openclaw
AGENCY_SYNC_INTERVAL_SECONDS=3600
```

- [ ] **Step 4: Deploy runtime**

Use Dockerfile path:

```text
deploy/agency-runtime/Dockerfile
```

Mount `agency_catalog` as read-only.

- [ ] **Step 5: Deploy API**

Use Dockerfile path:

```text
apps/control-plane/Dockerfile
```

Expose HTTPS domain:

```text
the configured Dokploy domain owned by the operator
```

Set healthcheck:

```text
/healthz
```

## Milestone 5: 24/24 Operations

**Files:**
- Create: `docs/operations/runbook.md`
- Create: `docs/operations/cost-controls.md`

- [ ] **Step 1: Cost controls**

Start with:

```text
AGENCY_MAX_PARALLEL_JOBS=1
AGENCY_MAX_TOKENS_PER_JOB=250000
daily job cap = 20
daily token cap = 2000000
```

- [ ] **Step 2: Monitoring**

Track:

```text
catalog sync success/failure
runtime uptime
job success/failure
tokens per job
cost per provider
top agents by spend
queue depth
```

- [ ] **Step 3: Backup**

Back up these volumes daily:

```text
agency_catalog
agency_jobs
postgres
```

- [ ] **Step 4: Incident runbook**

When spend spikes:

```text
set AGENCY_MAX_PARALLEL_JOBS=0
rotate provider API keys if needed
export /data/jobs for audit
inspect top prompts and agents
restart agency-api
```

When agent sync breaks:

```text
open catalog logs
run scripts/convert.sh manually inside catalog container
compare upstream commit in manifest.json
fall back to previous /data/agency/current backup
```

## Execution Order

1. Keep current clone in `D:\code\agents-agency`.
2. Commit this plan.
3. Implement Milestone 1 and verify catalog sync locally.
4. Decide OpenClaw vs OpenCode runtime after checking the runtime CLI install path.
5. Implement runtime container.
6. Implement API only after the runtime can boot.
7. Deploy catalog to Dokploy first.
8. Deploy runtime second.
9. Deploy API third.
10. Keep parallelism at 1 for the first 48 hours.

## First 48-Hour Operating Policy

- Only enable 10-20 high-value agents first:
  - `agents-orchestrator`
  - `backend-architect`
  - `frontend-developer`
  - `software-architect`
  - `devops-automator`
  - `security-engineer`
  - `reality-checker`
  - `growth-hacker`
  - `content-creator`
  - `sales-outbound-strategist`
- Require manual approval for jobs estimated above 100k tokens.
- Disable autonomous recursive job creation.
- Store every prompt and result for audit.
- Review cost daily before increasing `AGENCY_MAX_PARALLEL_JOBS`.

## Verification Gates

- `scripts/convert.sh --tool openclaw --out /tmp/agency-agents-openclaw-test` succeeds.
- `scripts/convert.sh --tool opencode --out /tmp/agency-agents-opencode-test` succeeds.
- Catalog container writes `manifest.json`.
- Runtime container responds to healthcheck.
- API returns at least one agent from `/agents`.
- Dokploy healthchecks stay green for 24 hours.
- A sample job completes and writes artifacts to `/data/jobs/<job-id>/`.

## Known Risks

- Upstream lint currently fails because docs under `strategy/` are included by `lint-agents.sh`; do not use that lint script as a blocking Dokploy gate until it skips non-agent docs.
- The upstream repo does not provide a daemon, queue, auth layer, or API budget controls.
- Running many agents concurrently can burn tokens quickly; launch with low concurrency and explicit spend caps.
- OpenClaw/OpenCode CLI installation details must be pinned during runtime Dockerfile implementation so Dokploy rebuilds stay deterministic.
