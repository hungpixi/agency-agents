# Agent Control Plane On Dokploy Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define a reusable Codex skill for building and operating an agent-control-plane container hosted by Dokploy, with Dokploy acting only as the container host.

**Architecture:** Codex builds a single self-contained control-plane app/container. Dokploy only runs it with persistent volumes, restart policy, logs, env injection, and optional public domain. The control-plane owns agent catalog sync, job queue, LLM calls, artifacts, and later optional infra actions through Dokploy API as a secondary tool.

**Tech Stack:** Codex skill, Node.js/TypeScript or Python control-plane app, Docker, Dokploy as host, persistent volumes, optional SQLite-first storage, optional Redis/Postgres later, GitHub CLI for repo operations.

---

## New Mental Model

Old model:

```text
Codex -> Dokploy API -> create many apps/dbs/domains -> agent runtime
```

Problem:

```text
Dokploy API becomes the orchestration brain.
Every capability depends on API correctness.
Provider-specific endpoint bugs block deployment.
```

New model:

```text
Dokploy -> hosts one long-running container
agent-control-plane container -> orchestration brain
Codex skill -> builds, deploys, verifies, and operates that container
```

Dokploy responsibilities:

```text
run container
restart always
inject secrets
mount volumes
expose domain
show logs
optional manual scaling
```

Control-plane responsibilities:

```text
sync agency-agents catalog
index available agents
run jobs
call LLM providers
store request/result/artifacts
enforce token/job limits
offer API/UI
optionally call Dokploy API later as a tool
```

## Skill Name

```text
agent-control-plane-dokploy
```

## Skill Trigger

Use this skill when the user asks:

```text
setup agent runtime on Dokploy
run agents 24/24
host an AI agency container
build an OPC agent control plane
deploy agency-agents as a service
make Dokploy host my agents
```

Do not use this skill for generic Dokploy app deployment unless agents/control-plane/runtime are involved.

## Skill File Location

Create:

```text
C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/SKILL.md
```

Optional helpers:

```text
C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/templates/control-plane.env.example
C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/templates/docker-compose.yml
C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/templates/README.md
```

## Env Design

Use two env files.

Global operator secret, optional:

```text
C:/Users/ppnh1/.codex/secrets/dokploy.env
```

Only needed if the control-plane or Codex needs to call Dokploy API later.

Project runtime env:

```text
deploy/control-plane.env.example
deploy/control-plane.env
```

Template:

```bash
# Agent Control Plane runtime
CONTROL_PLANE_NAME=agency-control-plane
CONTROL_PLANE_PUBLIC_URL=https://<domain>
CONTROL_PLANE_TOKEN=<generate-random-token>
NODE_ENV=production
PORT=3000
TZ=Asia/Saigon

# Agent catalog
AGENCY_REPO=https://github.com/msitarzewski/agency-agents.git
AGENCY_BRANCH=main
AGENCY_RUNTIME=openclaw
AGENCY_SYNC_INTERVAL_SECONDS=3600
AGENCY_CATALOG_DIR=/data/agency

# Storage
AGENCY_DATA_DIR=/data/control-plane
AGENCY_JOBS_DIR=/data/jobs
DATABASE_URL=sqlite:/data/control-plane/control-plane.db

# Limits
AGENCY_MAX_PARALLEL_JOBS=1
AGENCY_MAX_PROMPT_CHARS=20000
AGENCY_MAX_TOKENS_PER_JOB=250000
AGENCY_DAILY_JOB_LIMIT=20
AGENCY_DAILY_TOKEN_LIMIT=2000000

# Providers
OPENAI_API_KEY=<optional>
OPENAI_MODEL=gpt-4.1-mini
ANTHROPIC_API_KEY=<optional>
ANTHROPIC_MODEL=claude-sonnet-4-5
OPENROUTER_API_KEY=<optional>
GOOGLE_GENERATIVE_AI_API_KEY=<optional>

# Optional infra tool access. Not required for core runtime.
DOKPLOY_BASE_URL=https://dp.sgp1.w9.nu
DOKPLOY_API_KEY=<optional>
DOKPLOY_INFRA_TOOLS_ENABLED=false
```

SQLite-first is the default to avoid forcing Redis/Postgres before the system proves value. Redis/Postgres can be added later for distributed workers.

## Recommended Container Surface

Expose:

```text
GET  /healthz
GET  /readyz
GET  /agents
GET  /agents/:id
POST /jobs
GET  /jobs
GET  /jobs/:id
GET  /jobs/:id/result
POST /sync
GET  /metrics
```

Auth:

```text
Authorization: Bearer $CONTROL_PLANE_TOKEN
```

Unauthenticated:

```text
/healthz
/readyz
```

## Volume Design

Dokploy should mount:

```text
/data/agency         agent catalog clone and converted outputs
/data/control-plane  SQLite db, config, state
/data/jobs           job request/result/log artifacts
```

This makes the runtime restart-safe without external database dependency.

## Deployment Strategy

Preferred first deploy:

```text
Single Dockerfile application in Dokploy
Public Git repo or Docker image
One domain
Three persistent volumes
Restart always
```

Avoid using Dokploy API as the first path. Use UI once if needed:

```text
Project: agency-agents
Application: agency-control-plane
Build: Dockerfile from repo
Domain: user-chosen
Env: paste deploy/control-plane.env
Volumes: /data/agency, /data/control-plane, /data/jobs
```

After container is healthy, optional Dokploy API can be added as a tool inside the control-plane.

## Skill Content

Create `C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/SKILL.md`:

```markdown
---
name: agent-control-plane-dokploy
description: Build and operate a self-contained agent control-plane container hosted by Dokploy, where Dokploy is only the runtime host and the container owns agent orchestration.
---

# Agent Control Plane On Dokploy

Use this skill when the user wants a 24/7 agent runtime on Dokploy.

## Core Principle

Dokploy is the host, not the brain.

Build one self-contained `agent-control-plane` container. Let it manage:

- agent catalog sync
- job queue
- LLM calls
- artifacts
- cost limits
- API/UI
- optional infra tools

Use Dokploy for:

- container hosting
- env injection
- persistent volumes
- restart policy
- domain/SSL
- logs

## Default Architecture

```text
Dokploy application: agency-control-plane
  image/build: Dockerfile
  port: 3000
  volumes:
    /data/agency
    /data/control-plane
    /data/jobs
  env:
    deploy/control-plane.env
```

## Required Workflow

1. Check whether the repo already has a control-plane app.
2. If not, create one with:
   - `GET /healthz`
   - `GET /readyz`
   - `GET /agents`
   - `POST /jobs`
   - `GET /jobs/:id`
   - `POST /sync`
3. Create `deploy/control-plane.env.example`.
4. Prefer SQLite-first persistence at `/data/control-plane/control-plane.db`.
5. Build and test locally with Docker.
6. Push to GitHub with `gh`.
7. Ask user to create or confirm the Dokploy app if API deployment is risky.
8. Verify the public health endpoint after deploy.

## Safety Rules

- Do not require Redis/Postgres for the first version.
- Do not depend on Dokploy API for normal agent operation.
- Do not call Dokploy delete/remove endpoints during probing.
- Do not expose job endpoints without bearer token.
- Do not log provider API keys or control-plane token.
- Start with `AGENCY_MAX_PARALLEL_JOBS=1`.
- Store all job artifacts under `/data/jobs`.

## When To Use Dokploy API

Only use Dokploy API as a secondary infra tool after the control-plane is healthy.

Allowed use cases:

- inventory projects
- read logs/status if endpoint is verified
- restart this control-plane app
- deploy child apps after explicit user approval

Avoid:

- making Dokploy API the main orchestrator
- relying on `application.saveGithubProvider` on this instance unless re-audited
- creating/deleting resources during capability probes

## Verification

Before claiming success, run:

```powershell
rtk proxy npm --prefix apps/control-plane run check
rtk proxy docker build -f apps/control-plane/Dockerfile -t agency-control-plane .
```

If Docker is unavailable locally, say so and verify with syntax checks plus Dokploy build logs.

After deployment:

```powershell
curl https://<domain>/healthz
curl -H "Authorization: Bearer <token>" https://<domain>/agents
```
```

## Implementation Plan For A Repo

When applying this skill to a repo, create:

```text
apps/control-plane/package.json
apps/control-plane/src/server.js
apps/control-plane/src/agents.js
apps/control-plane/src/jobs.js
apps/control-plane/src/catalog.js
apps/control-plane/src/auth.js
apps/control-plane/src/provider-openai.js
apps/control-plane/Dockerfile
deploy/control-plane.env.example
docs/deployment/dokploy-control-plane.md
```

## Task 1: Replace Dokploy-API-Centric Plan

**Files:**
- Create: `docs/architecture/agent-control-plane.md`
- Modify: `docs/superpowers/plans/2026-05-03-dokploy-api-full-automation.md`

- [ ] **Step 1: Document new architecture**

Create `docs/architecture/agent-control-plane.md`:

```markdown
# Agent Control Plane Architecture

Dokploy hosts one long-running control-plane container.

The container owns agent orchestration:

- catalog sync from `agency-agents`
- agent index
- authenticated job API
- provider calls
- job artifacts
- cost and concurrency limits

Dokploy owns hosting only:

- restart
- volumes
- env
- domain
- logs

Dokploy API is optional and secondary.
```

- [ ] **Step 2: Mark old plan as superseded**

At the top of `docs/superpowers/plans/2026-05-03-dokploy-api-full-automation.md`, add:

```markdown
> Superseded for first production path by `2026-05-03-agent-control-plane-dokploy-skill.md`.
> Reason: Dokploy API should not be the main orchestration layer; host a control-plane container instead.
```

## Task 2: Create Skill Locally

**Files:**
- Create: `C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/SKILL.md`

- [ ] **Step 1: Create skill directory**

Run:

```powershell
rtk powershell -Command "New-Item -ItemType Directory -Force C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy | Out-Null"
```

- [ ] **Step 2: Write skill body**

Use the "Skill Content" section above.

- [ ] **Step 3: Verify skill file**

Run:

```powershell
rtk read C:/Users/ppnh1/.codex/skills/agent-control-plane-dokploy/SKILL.md
```

Expected:

```text
name: agent-control-plane-dokploy
```

## Task 3: Create Runtime Env Template

**Files:**
- Create: `deploy/control-plane.env.example`

- [ ] **Step 1: Add env template**

Use the "Env Design" template above.

- [ ] **Step 2: Verify no real secrets**

Run:

```powershell
rtk grep "sk-|ghp_|gho_|DOKPLOY_API_KEY=.*[A-Za-z0-9_-]\\{20,\\}" deploy/control-plane.env.example
```

Expected:

```text
no matches
```

## Task 4: Refactor Current Control Plane Toward This Model

**Files:**
- Modify: `apps/control-plane/src/server.js`
- Modify: `apps/control-plane/src/agents.js`
- Modify: `apps/control-plane/src/jobs.js`
- Create: `apps/control-plane/src/catalog.js`
- Create: `apps/control-plane/src/auth.js`
- Create: `docs/deployment/dokploy-control-plane.md`

- [ ] **Step 1: Add `/readyz`**

`/readyz` should check:

```text
catalog directory exists
jobs directory writable
```

- [ ] **Step 2: Add `/sync`**

`POST /sync` should run catalog sync inside the container or mark a sync request for the background worker.

- [ ] **Step 3: Require auth for all non-health routes**

Only `/healthz` and `/readyz` are public.

- [ ] **Step 4: Document Dokploy setup**

Create `docs/deployment/dokploy-control-plane.md` with:

```text
Dokploy project name
application name
Dockerfile path
port 3000
volumes
env file
healthcheck path
```

## Task 5: Verification

**Files:**
- None

- [ ] **Step 1: Syntax check**

Run:

```powershell
rtk proxy npm --prefix apps/control-plane run check
```

Expected: exit code `0`.

- [ ] **Step 2: Catalog conversion still works**

Run:

```powershell
rtk proxy bash scripts/convert.sh --tool openclaw --out /tmp/agency-agents-openclaw-test
```

Expected:

```text
Converted 184 agents for openclaw
```

- [ ] **Step 3: Git status**

Run:

```powershell
rtk git status --short
```

Expected: only intentional files modified.

## Success Criteria

- A reusable Codex skill exists for the new architecture.
- Dokploy is no longer treated as the orchestration brain.
- The first production path requires only one Dokploy app/container.
- Runtime state is volume-backed and restart-safe.
- The control-plane can run without Redis/Postgres.
- Dokploy API becomes optional infra tooling, not a hard dependency.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-agent-control-plane-dokploy-skill.md`.

Recommended execution:

1. Inline Execution for creating the skill and env template.
2. Then implement/refactor the control-plane app.
3. Then push to GitHub and deploy one Dokploy app manually or via a safer API path.
