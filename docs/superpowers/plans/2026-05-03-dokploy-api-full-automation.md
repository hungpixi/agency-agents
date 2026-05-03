# Dokploy API Full Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local automation workflow where the operator only fills `deploy/dokploy.env`, then Codex creates and deploys the full Agency Agents OPC stack on Dokploy through the Dokploy API.

**Architecture:** Add a small Dokploy automation client to this repo. The client reads `deploy/dokploy.env`, validates required secrets, calls Dokploy REST endpoints to create project/environment/apps/domains/mounts/env vars, triggers deployment, and verifies health endpoints.

**Tech Stack:** PowerShell-compatible local workflow, Bash where containers need it, Node.js/TypeScript control-plane app, Docker, Dokploy API, Redis, Postgres, OpenClaw, GitHub repository deployment.

---

## What The User Provides Once

Create `deploy/dokploy.env` from `deploy/dokploy.env.example` and fill:

```bash
DOKPLOY_BASE_URL=https://dp.sgp1.w9.nu
DOKPLOY_API_KEY=<dokploy-api-key>
DOKPLOY_PROJECT_NAME=agency-agents-opc
DOKPLOY_ENVIRONMENT_NAME=production
AGENCY_API_DOMAIN=<domain-pointing-to-dokploy-server>
AGENCY_DEPLOY_REPOSITORY=<github-owner-or-org>/<repo-name>
AGENCY_DEPLOY_BRANCH=main
OPENCLAW_GATEWAY_TOKEN=<random-32-byte-token>
CONTROL_PLANE_TOKEN=<random-32-byte-token>
REDIS_URL=<redis-url>
DATABASE_URL=<postgres-url>
OPENAI_API_KEY=<optional>
ANTHROPIC_API_KEY=<optional>
OPENROUTER_API_KEY=<optional>
```

Do not commit `deploy/dokploy.env`.

## Dokploy API Findings

Swagger URL supplied by user: `https://dp.sgp1.w9.nu/swagger`

The instance redirects unauthenticated browser access to sign-in, so automation must use `DOKPLOY_API_KEY`. Public Dokploy API docs show these endpoint families are available and sufficient for this plan:

```text
POST /api/project.create
POST /api/environment.create
POST /api/application.create
POST /api/application.saveEnvironment
POST /api/application.saveBuildType
POST /api/domain.create
POST /api/mounts.create
POST /api/application.deploy
```

The automation script must discover exact request/response shapes from the authenticated Swagger/OpenAPI JSON before making mutations.

## Target Dokploy Resources

Project:

```text
agency-agents-opc
```

Environment:

```text
production
```

Applications:

```text
agency-catalog
agency-runtime
agency-api
```

Mounts:

```text
agency_catalog -> /data/agency
agency_runtime -> /data/runtime
agency_jobs -> /data/jobs
```

Domains:

```text
agency-api -> https://$AGENCY_API_DOMAIN
agency-runtime -> only if $AGENCY_RUNTIME_DOMAIN is non-empty
```

Healthchecks:

```text
agency-api: /healthz
agency-runtime: internal OpenClaw gateway status on port 18789
```

## Files To Create

```text
deploy/dokploy.env.example
deploy/dokploy.env
deploy/dokploy/openapi-cache.json
scripts/dokploy/bootstrap.ps1
scripts/dokploy/bootstrap.mjs
scripts/dokploy/lib/env.mjs
scripts/dokploy/lib/client.mjs
scripts/dokploy/lib/resources.mjs
scripts/dokploy/lib/verify.mjs
scripts/dokploy/README.md
deploy/agency-catalog/Dockerfile
deploy/agency-catalog/sync.sh
deploy/agency-runtime/Dockerfile
deploy/agency-runtime/entrypoint.sh
apps/control-plane/package.json
apps/control-plane/src/server.ts
apps/control-plane/src/agents.ts
apps/control-plane/src/jobs.ts
apps/control-plane/Dockerfile
```

## Task 1: Protect Real Env Files

**Files:**
- Modify: `.gitignore`
- Modify: `deploy/dokploy.env.example`

- [ ] **Step 1: Add ignore rules**

Add:

```gitignore
deploy/dokploy.env
deploy/*.local.env
deploy/dokploy/openapi-cache.json
```

- [ ] **Step 2: Verify**

Run:

```powershell
rtk git status --short
```

Expected: `deploy/dokploy.env` does not appear after the user creates it.

## Task 2: Build Authenticated Dokploy API Discovery

**Files:**
- Create: `scripts/dokploy/bootstrap.ps1`
- Create: `scripts/dokploy/bootstrap.mjs`
- Create: `scripts/dokploy/lib/env.mjs`
- Create: `scripts/dokploy/lib/client.mjs`

- [ ] **Step 1: Implement env loader**

Create `scripts/dokploy/lib/env.mjs`:

```js
import fs from "node:fs";

export function loadEnv(path = "deploy/dokploy.env") {
  const text = fs.readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key] || env[key].includes("<"));
  if (missing.length) {
    throw new Error(`Missing required env values: ${missing.join(", ")}`);
  }
}
```

- [ ] **Step 2: Implement API client**

Create `scripts/dokploy/lib/client.mjs`:

```js
export class DokployClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async request(path, body = undefined) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${path} failed ${response.status}: ${text}`);
    }
    return data;
  }
}
```

- [ ] **Step 3: Probe Swagger/OpenAPI**

In `scripts/dokploy/bootstrap.mjs`, try these paths in order and save the first valid JSON:

```text
/swagger/json
/swagger.json
/openapi.json
/api/openapi.json
```

Write the result to `deploy/dokploy/openapi-cache.json`.

- [ ] **Step 4: Verify**

Run:

```powershell
rtk proxy node scripts/dokploy/bootstrap.mjs --discover-only
```

Expected:

```text
Authenticated Dokploy API OK
OpenAPI schema cached
```

## Task 3: Create Catalog, Runtime, And API Containers

**Files:**
- Create: `deploy/agency-catalog/Dockerfile`
- Create: `deploy/agency-catalog/sync.sh`
- Create: `deploy/agency-runtime/Dockerfile`
- Create: `deploy/agency-runtime/entrypoint.sh`
- Create: `apps/control-plane/*`

- [ ] **Step 1: Implement catalog syncer**

Use the catalog syncer from `docs/superpowers/plans/2026-05-03-agency-agents-dokploy-24x7.md`.

- [ ] **Step 2: Implement OpenClaw runtime**

Use Node 24 and install OpenClaw globally:

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git bash curl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@latest
```

- [ ] **Step 3: Implement control-plane API**

Expose:

```text
GET /healthz
GET /agents
POST /jobs
GET /jobs/:id
POST /sync
```

- [ ] **Step 4: Verify locally**

Run:

```powershell
rtk proxy bash scripts/convert.sh --tool openclaw --out /tmp/agency-agents-openclaw-test
```

Expected:

```text
Converted 184 agents for openclaw
```

## Task 4: Generate Dokploy Resource Payloads

**Files:**
- Create: `scripts/dokploy/lib/resources.mjs`

- [ ] **Step 1: Implement resource builder**

Create pure functions:

```js
export function buildProject(env) {
  return {
    name: env.DOKPLOY_PROJECT_NAME,
    description: env.DOKPLOY_DESCRIPTION || "Agency Agents OPC 24x7 runtime",
  };
}

export function buildEnvironment(env, projectId) {
  return {
    name: env.DOKPLOY_ENVIRONMENT_NAME,
    projectId,
  };
}

export function buildApp({ name, env, environmentId }) {
  return {
    name,
    environmentId,
    sourceType: "github",
    repository: env.AGENCY_DEPLOY_REPOSITORY,
    branch: env.AGENCY_DEPLOY_BRANCH,
  };
}

export function buildAppEnv(env, appName) {
  return Object.entries(env)
    .filter(([key]) => key.startsWith("AGENCY_") || key.startsWith("OPENCLAW_") || key.endsWith("_API_KEY") || key.endsWith("_URL") || key === "NODE_ENV" || key === "TZ" || key === "LOG_LEVEL")
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
```

- [ ] **Step 2: Verify payload generation**

Run:

```powershell
rtk proxy node scripts/dokploy/bootstrap.mjs --dry-run
```

Expected:

```text
Would create project agency-agents-opc
Would create environment production
Would create applications agency-catalog, agency-runtime, agency-api
Would create mounts /data/agency, /data/runtime, /data/jobs
Would create domain for agency-api
```

## Task 5: Implement Idempotent Dokploy Mutations

**Files:**
- Modify: `scripts/dokploy/bootstrap.mjs`
- Create: `scripts/dokploy/lib/verify.mjs`

- [ ] **Step 1: Create project**

Call:

```text
POST /api/project.create
```

If project already exists, reuse it instead of failing.

- [ ] **Step 2: Create environment**

Call:

```text
POST /api/environment.create
```

If environment already exists, reuse it.

- [ ] **Step 3: Create applications**

Call:

```text
POST /api/application.create
```

Create:

```text
agency-catalog
agency-runtime
agency-api
```

- [ ] **Step 4: Configure build type**

Call:

```text
POST /api/application.saveBuildType
```

Set each app to GitHub/Dockerfile build with:

```text
agency-catalog -> deploy/agency-catalog/Dockerfile
agency-runtime -> deploy/agency-runtime/Dockerfile
agency-api -> apps/control-plane/Dockerfile
```

- [ ] **Step 5: Configure environment variables**

Call:

```text
POST /api/application.saveEnvironment
```

Inject the generated app env block.

- [ ] **Step 6: Create mounts**

Call:

```text
POST /api/mounts.create
```

Mount:

```text
/data/agency
/data/runtime
/data/jobs
```

- [ ] **Step 7: Create domain**

Call:

```text
POST /api/domain.create
```

Create domain only for `agency-api` first. Keep runtime private unless `AGENCY_RUNTIME_DOMAIN` is set.

- [ ] **Step 8: Deploy**

Call:

```text
POST /api/application.deploy
```

Deploy in order:

```text
agency-catalog
agency-runtime
agency-api
```

## Task 6: Verify End To End

**Files:**
- Modify: `scripts/dokploy/lib/verify.mjs`
- Create: `scripts/dokploy/README.md`

- [ ] **Step 1: Verify API health**

Call:

```text
GET https://$AGENCY_API_DOMAIN/healthz
```

Expected:

```json
{ "ok": true }
```

- [ ] **Step 2: Verify agent list**

Call:

```text
GET https://$AGENCY_API_DOMAIN/agents
```

Expected: response contains at least:

```text
backend-architect
frontend-developer
agents-orchestrator
```

- [ ] **Step 3: Verify job submission with auth**

Call:

```text
POST https://$AGENCY_API_DOMAIN/jobs
Authorization: Bearer $CONTROL_PLANE_TOKEN
```

Payload:

```json
{
  "agent": "backend-architect",
  "prompt": "Return a one paragraph readiness check for this runtime."
}
```

Expected:

```text
job created, status becomes succeeded or failed with logs saved under /data/jobs
```

## Codex Action Flow After User Fills Env

Once `deploy/dokploy.env` contains real values, Codex should run:

```powershell
rtk proxy node scripts/dokploy/bootstrap.mjs --discover-only
rtk proxy node scripts/dokploy/bootstrap.mjs --dry-run
rtk proxy node scripts/dokploy/bootstrap.mjs --apply
rtk proxy node scripts/dokploy/bootstrap.mjs --verify
```

Codex should stop and report if:

```text
Dokploy API key is invalid
Swagger/OpenAPI schema cannot be discovered
AGENCY_API_DOMAIN DNS does not point to Dokploy
Redis/Postgres URLs are missing
GitHub repository is not accessible by Dokploy
Docker build fails
healthcheck fails after deployment
```

## Operator Touch Points

The user should only need to:

1. Copy `deploy/dokploy.env.example` to `deploy/dokploy.env`.
2. Fill real credentials, domains, provider keys, Redis URL, and Postgres URL.
3. Make sure DNS points `AGENCY_API_DOMAIN` to the Dokploy server.

Everything else should be done by Codex through the automation script.

## Sources

- User Dokploy Swagger URL: `https://dp.sgp1.w9.nu/swagger`
- Dokploy public API docs: `https://docs.dokploy.com/docs/api/application`, `https://docs.dokploy.com/docs/api/project`, `https://docs.dokploy.com/docs/api/domain`, `https://docs.dokploy.com/docs/api/mounts`, `https://docs.dokploy.com/docs/api/environment`
- Agency Agents upstream: `https://github.com/msitarzewski/agency-agents`
