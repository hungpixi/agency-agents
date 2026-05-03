---
name: agent-control-plane-dokploy
description: End-to-end setup and operation of a self-contained 24/7 agent control-plane container on Dokploy, for users and Codex agents who know nothing about Dokploy or the agent runtime.
---

# Agent Control Plane On Dokploy

Use this skill when the user wants to run an AI agent agency, OPC runtime, or `agency-agents`-style system 24/7 on Dokploy.

## Core Principle

Dokploy is the host, not the brain.

Build one self-contained `agent-control-plane` container. The container owns orchestration:

- sync the agent catalog
- index agents
- run jobs
- call LLM providers
- write logs and artifacts
- enforce token/job limits
- expose API/UI
- optionally use Dokploy API later as an infra tool

Dokploy only provides:

- container build/run
- restart policy
- env injection
- volumes
- domain/SSL
- logs

## Current Known Good Repo Shape

For this repo, the expected files are:

```text
apps/control-plane/Dockerfile
apps/control-plane/package.json
apps/control-plane/src/server.js
apps/control-plane/src/catalog.js
apps/control-plane/src/agents.js
apps/control-plane/src/jobs.js
apps/control-plane/src/auth.js
deploy/control-plane.env.example
docs/deployment/dokploy-control-plane.md
```

Expected control-plane endpoints:

```text
GET  /healthz          public
GET  /readyz           public
GET  /agents           bearer token required
GET  /agents/:id       bearer token required
GET  /jobs             bearer token required
POST /jobs             bearer token required
GET  /jobs/:id         bearer token required
GET  /jobs/:id/result  bearer token required
POST /sync             bearer token required
```

## End-To-End Workflow

Follow these phases in order.

### Phase 0: Explain Current State

Tell the user plainly:

```text
The code can run, but it is not running on Dokploy until a Dokploy application is created or updated with the repo, env, volumes, port, and healthcheck.
```

If the repo has already been pushed to GitHub, say which repo and commit.

### Phase 1: Verify Local Code

Run:

```powershell
rtk proxy npm --prefix apps/control-plane run check
```

Expected:

```text
node --check passes for server, catalog, agents, jobs, auth
```

Then verify catalog sync without Docker using Node:

```powershell
rtk proxy node --input-type=module -e "import { syncCatalog, readiness } from './apps/control-plane/src/catalog.js'; import { listAgents } from './apps/control-plane/src/agents.js'; process.env.AGENCY_CATALOG_DIR='D:/tmp/agency-control-plane-test'; process.env.AGENCY_JOBS_DIR='D:/tmp/agency-control-plane-test-jobs'; process.env.AGENCY_RUNTIME='openclaw'; const result=await syncCatalog(); const ready=await readiness(); const agents=await listAgents(); console.log(JSON.stringify({runtime:result.manifest.runtime,ready:ready.ok,agentCount:agents.length,firstAgent:agents[0]?.id}));"
```

Expected:

```json
{"runtime":"openclaw","ready":true,"agentCount":184}
```

Then smoke-test HTTP auth:

```powershell
rtk proxy node --input-type=module -e "import { spawn } from 'node:child_process'; const env={...process.env,PORT:'3099',CONTROL_PLANE_TOKEN:'test-token',AGENCY_CATALOG_DIR:'D:/tmp/agency-control-plane-test',AGENCY_JOBS_DIR:'D:/tmp/agency-control-plane-test-jobs'}; const child=spawn('node',['apps/control-plane/src/server.js'],{env,stdio:'ignore'}); await new Promise(r=>setTimeout(r,2000)); try{ const health=await fetch('http://127.0.0.1:3099/healthz'); const unauth=await fetch('http://127.0.0.1:3099/agents'); const auth=await fetch('http://127.0.0.1:3099/agents',{headers:{Authorization:'Bearer test-token'}}); const body=await auth.json(); console.log(JSON.stringify({health:health.status,agents_unauth:unauth.status,agents_count:body.agents.length})); } finally { child.kill('SIGTERM'); }"
```

Expected:

```json
{"health":200,"agents_unauth":401,"agents_count":184}
```

If Docker is available, also run:

```powershell
rtk proxy docker build -f apps/control-plane/Dockerfile -t agency-control-plane .
```

If Docker is unavailable, do not block. State that Docker build must be verified by Dokploy build logs.

### Phase 2: Prepare Runtime Env

Create real runtime env from:

```text
deploy/control-plane.env.example
```

The user must provide or approve:

```text
CONTROL_PLANE_PUBLIC_URL
CONTROL_PLANE_TOKEN
at least one provider key if real LLM jobs should run
```

The system can still run in dry-run mode without provider keys, but real agent answers need a provider key.

Do not require Redis/Postgres for the first version.

### Phase 3: Push GitHub Repo

Prefer GitHub CLI:

```powershell
rtk proxy gh repo view hungpixi/agency-agents --json nameWithOwner,url,defaultBranchRef
rtk git status --short
rtk proxy git push
```

Never commit real env files.

### Phase 4: Configure One Dokploy App

Use Dokploy UI first unless the Dokploy API path has been re-audited in this exact session.

Create or update:

```text
Project: agency-agents
Application: agency-control-plane
Repository: hungpixi/agency-agents
Branch: main
Build type: Dockerfile
Dockerfile path: apps/control-plane/Dockerfile
Docker context: /
Port: 3000
Healthcheck path: /healthz
Restart policy: always
```

Mount persistent volumes:

```text
/data/agency
/data/control-plane
/data/jobs
```

Paste env values from `deploy/control-plane.env`.

Do not create Redis or Postgres unless the user explicitly asks to scale beyond one container.

### Phase 5: Verify Deployment

After Dokploy reports the app is running:

```bash
curl https://<domain>/healthz
```

Expected:

```json
{"ok":true}
```

Trigger initial catalog sync:

```bash
curl -X POST https://<domain>/sync \
  -H "Authorization: Bearer <CONTROL_PLANE_TOKEN>"
```

Then:

```bash
curl https://<domain>/readyz
curl https://<domain>/agents \
  -H "Authorization: Bearer <CONTROL_PLANE_TOKEN>"
```

Expected:

```text
/readyz ok true
/agents returns around 184 agents
```

Submit a dry-run job:

```bash
curl -X POST https://<domain>/jobs \
  -H "Authorization: Bearer <CONTROL_PLANE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"agent":"backend-architect","prompt":"Return one paragraph saying the runtime is reachable."}'
```

Then fetch the job result by ID.

## What The User Must Do

If Codex does not have safe working Dokploy API automation, the user must do only this in Dokploy UI:

1. Create or open project `agency-agents`.
2. Create app `agency-control-plane`.
3. Point it to `hungpixi/agency-agents`, branch `main`.
4. Set Dockerfile path `apps/control-plane/Dockerfile`.
5. Set port `3000`.
6. Add volumes `/data/agency`, `/data/control-plane`, `/data/jobs`.
7. Paste env from `deploy/control-plane.env`.
8. Deploy.

Everything else should be handled by Codex: code, repo, env template, sync verification, API checks, and job tests.

## What Codex Must Not Do

- Do not make Dokploy API the main orchestration path.
- Do not call Dokploy delete/remove endpoints during probing.
- Do not assume `application.saveGithubProvider` works on this instance.
- Do not print tokens or provider keys.
- Do not claim the system is running until public `/healthz` or Dokploy logs prove it.
- Do not require Redis/Postgres before the single-container version is proven.

## Completion Criteria

Only say setup is complete when:

- repo code is pushed
- Dokploy app is running
- `/healthz` returns 200
- `/sync` succeeds
- `/readyz` returns ok
- authenticated `/agents` returns the catalog
- at least one test job is submitted and result/log artifact exists
