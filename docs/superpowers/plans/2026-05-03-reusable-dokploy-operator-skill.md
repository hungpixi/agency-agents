# Reusable Dokploy Operator Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable Codex skill and `.env` convention for safely operating the user's Dokploy instance across future projects.

**Architecture:** Store Dokploy credentials in a private env file, expose a reusable skill that always performs API capability audit before mutation, and provide small scripts for read-only inventory, safe dry-runs, and explicit apply operations. Dangerous operations require exact resource IDs plus a named mode such as `--delete-confirm`.

**Tech Stack:** Codex skills, Node.js API client, Dokploy REST API with `x-api-key`, GitHub CLI, RTK shell policy, local private env files.

---

## Background And Lessons Learned

Dokploy instance:

```text
https://dp.sgp1.w9.nu
```

Confirmed auth mode:

```text
Header: x-api-key: $DOKPLOY_API_KEY
```

Confirmed project:

```text
agency-agents
```

Important API evidence from this instance:

```text
GET  /api/project.all                 -> 200 OK
GET  /api/gitProvider.getAll          -> 200 OK
GET  /api/server.all                  -> 200 OK
POST /api/project.create              -> schema exists, creates project
POST /api/project.remove              -> schema exists, removes project
POST /api/application.create          -> schema exists, creates app
POST /api/postgres.create             -> schema exists, creates Postgres
POST /api/redis.create                -> schema exists, creates Redis
POST /api/application.saveEnvironment -> schema exists
POST /api/application.saveBuildType   -> schema exists
POST /api/application.deploy          -> schema exists
POST /api/mounts.create               -> schema exists
POST /api/domain.create               -> schema exists
```

Known issue:

```text
POST /api/application.saveGithubProvider
```

returned `500 INTERNAL_SERVER_ERROR` when called with a schema-valid payload. Therefore the reusable skill must not assume GitHub-provider deploy works. It should prefer either:

```text
application.saveGitProvider with public custom Git URL
```

or:

```text
build/push image through GitHub/GHCR, then application.saveDockerProvider
```

Safety lesson:

Dokploy ignores unknown extra fields on some mutation endpoints. A "probe" request with a real resource ID and an invalid extra field can still mutate/delete the resource. Therefore:

```text
Never probe mutation endpoints with real IDs.
Never test delete/remove endpoints unless the user explicitly asks for cleanup.
Probe mutation schemas only with empty bodies or fake syntactically invalid IDs.
```

## File Layout

Create:

```text
C:/Users/ppnh1/.codex/skills/dokploy-operator/SKILL.md
C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs
C:/Users/ppnh1/.codex/skills/dokploy-operator/templates/dokploy.env.example
```

Optionally keep repo-local copies:

```text
deploy/dokploy.operator.env.example
scripts/dokploy/operator-audit.mjs
```

Private env file:

```text
C:/Users/ppnh1/.codex/secrets/dokploy.env
```

Do not store the reusable Dokploy API key in project repos.

## Standard Env Template

Create `C:/Users/ppnh1/.codex/skills/dokploy-operator/templates/dokploy.env.example`:

```bash
# Dokploy operator credentials
DOKPLOY_BASE_URL=https://dp.sgp1.w9.nu
DOKPLOY_API_KEY=<dokploy-api-key>

# Default ownership
DOKPLOY_DEFAULT_PROJECT=
DOKPLOY_DEFAULT_ENVIRONMENT=production
DOKPLOY_DEFAULT_GITHUB_OWNER=hungpixi
DOKPLOY_DEFAULT_BRANCH=main

# Safety defaults
DOKPLOY_READ_ONLY=true
DOKPLOY_REQUIRE_EXPLICIT_APPLY=true
DOKPLOY_ALLOW_DELETE=false
DOKPLOY_ALLOW_GITHUB_PROVIDER=false
DOKPLOY_PREFERRED_DEPLOY_MODE=custom-git

# Optional domains
DOKPLOY_BASE_DOMAIN=

# Optional container registry path for Docker-image deployment mode
GHCR_OWNER=hungpixi
GHCR_VISIBILITY=private
```

Create real file at:

```text
C:/Users/ppnh1/.codex/secrets/dokploy.env
```

with the real `DOKPLOY_API_KEY`.

## Skill Behavior

The skill must trigger when the user asks to:

```text
deploy to Dokploy
create Dokploy project
inspect Dokploy
setup Dokploy env
create Redis/Postgres on Dokploy
attach domains/mounts/env vars on Dokploy
```

The skill must always:

1. Load `C:/Users/ppnh1/.codex/secrets/dokploy.env`.
2. Refuse to print secret values.
3. Run read-only inventory first.
4. Run capability audit for required endpoint families.
5. Prefer dry-run.
6. Require explicit user request or `--apply` before mutation.
7. Avoid `application.saveGithubProvider` unless `DOKPLOY_ALLOW_GITHUB_PROVIDER=true`.
8. Never call delete/remove endpoints unless `DOKPLOY_ALLOW_DELETE=true` and the user explicitly names the target resource.

## Skill Content

Create `C:/Users/ppnh1/.codex/skills/dokploy-operator/SKILL.md`:

```markdown
---
name: dokploy-operator
description: Safely operate the user's Dokploy instance through API audit, dry-run planning, and explicit apply workflows for projects, apps, databases, mounts, domains, and deployments.
---

# Dokploy Operator

Use this skill when operating Dokploy at `https://dp.sgp1.w9.nu` or any user-provided Dokploy instance.

## Safety Rules

- Load credentials from `C:/Users/ppnh1/.codex/secrets/dokploy.env` unless the user explicitly provides another env path.
- Never print `DOKPLOY_API_KEY` or provider secrets.
- Always use `x-api-key` auth.
- Always run inventory before mutation.
- Always run dry-run before apply.
- Never probe delete/remove endpoints with real resource IDs.
- Never call delete/remove unless the user explicitly asks for cleanup and `DOKPLOY_ALLOW_DELETE=true`.
- Treat `application.saveGithubProvider` as unsafe on this instance unless re-audited and explicitly enabled.
- Prefer `application.saveGitProvider` custom public Git URL or `application.saveDockerProvider` image deployment.

## Required Workflow

1. Run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs inventory
```

2. Run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs audit
```

3. For a target project, run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs plan --project <name> --mode <custom-git|docker-image>
```

4. Only after user approval or explicit request to apply, run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs apply --project <name> --mode <custom-git|docker-image>
```

5. Verify:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs verify --project <name>
```

## Endpoint Status For This Instance

- `GET /api/project.all`: known working.
- `GET /api/gitProvider.getAll`: known working.
- `GET /api/server.all`: known working.
- `POST /api/project.create`: schema exists and works.
- `POST /api/project.remove`: schema exists and works, dangerous.
- `POST /api/application.create`: schema exists and works.
- `POST /api/postgres.create`: schema exists and works.
- `POST /api/redis.create`: schema exists and works.
- `POST /api/application.saveEnvironment`: schema exists.
- `POST /api/application.saveBuildType`: schema exists.
- `POST /api/application.deploy`: schema exists.
- `POST /api/mounts.create`: schema exists.
- `POST /api/domain.create`: schema exists.
- `POST /api/application.saveGithubProvider`: returned 500 with valid payload. Avoid.
```

## Client Script Requirements

Create `dokploy-client.mjs` with these commands:

```text
inventory
audit
plan
apply
verify
cleanup
```

Command behavior:

```text
inventory: GET /api/project.all, GET /api/gitProvider.getAll, GET /api/server.all
audit: safe endpoint checks using GET or empty-body schema calls only
plan: produce proposed resources without mutation
apply: create/update resources only for the named project
verify: re-read resources and test public health endpoints when domain exists
cleanup: only if DOKPLOY_ALLOW_DELETE=true and explicit resource IDs are provided
```

## API Client Implementation Notes

Use:

```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": env.DOKPLOY_API_KEY
}
```

Do not use Bearer auth for this instance. It returned `401 Unauthorized`.

## Task 1: Create Secret Env Directory

**Files:**
- Create: `C:/Users/ppnh1/.codex/secrets/dokploy.env`
- Create: `C:/Users/ppnh1/.codex/skills/dokploy-operator/templates/dokploy.env.example`

- [ ] **Step 1: Create directories**

Run:

```powershell
rtk powershell -Command "New-Item -ItemType Directory -Force C:/Users/ppnh1/.codex/secrets, C:/Users/ppnh1/.codex/skills/dokploy-operator/templates | Out-Null"
```

- [ ] **Step 2: Copy existing key**

Read `deploy/dokploy.env` locally, copy only:

```text
DOKPLOY_BASE_URL
DOKPLOY_API_KEY
```

into:

```text
C:/Users/ppnh1/.codex/secrets/dokploy.env
```

Do not print the API key.

- [ ] **Step 3: Verify without leaking key**

Run:

```powershell
rtk proxy node -e "const fs=require('fs');const s=fs.readFileSync('C:/Users/ppnh1/.codex/secrets/dokploy.env','utf8'); console.log(/^DOKPLOY_API_KEY=.+/m.test(s)?'dokploy_key_set':'dokploy_key_missing')"
```

Expected:

```text
dokploy_key_set
```

## Task 2: Create Dokploy Skill

**Files:**
- Create: `C:/Users/ppnh1/.codex/skills/dokploy-operator/SKILL.md`

- [ ] **Step 1: Write skill body**

Use the "Skill Content" section above.

- [ ] **Step 2: Verify skill exists**

Run:

```powershell
rtk read C:/Users/ppnh1/.codex/skills/dokploy-operator/SKILL.md
```

Expected: frontmatter includes:

```yaml
name: dokploy-operator
```

## Task 3: Create Reusable Client

**Files:**
- Create: `C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs`

- [ ] **Step 1: Implement env loading**

Load:

```text
C:/Users/ppnh1/.codex/secrets/dokploy.env
```

Fallback to:

```text
deploy/dokploy.env
```

only when the current repo has it.

- [ ] **Step 2: Implement inventory**

Call:

```text
GET /api/project.all
GET /api/gitProvider.getAll
GET /api/server.all
```

Output only non-secret fields:

```text
project name/id
environment name/id
application names/ids/status
postgres ids
redis ids
git provider id/name/type
server count
```

- [ ] **Step 3: Implement audit**

Use empty body schema checks only:

```text
POST /api/application.create {}
POST /api/postgres.create {}
POST /api/redis.create {}
POST /api/application.saveEnvironment {}
POST /api/application.saveBuildType {}
POST /api/application.saveGitProvider {}
POST /api/application.saveDockerProvider {}
POST /api/mounts.create {}
POST /api/domain.create {}
```

Expected result for available mutation endpoints:

```text
400 BAD_REQUEST with zod fieldErrors
```

Treat `404 NOT_FOUND` as missing endpoint.
Treat `500` as unsafe endpoint.

- [ ] **Step 4: Implement plan/apply skeleton**

`plan` must print intended resources and deployment mode.

`apply` must refuse unless:

```text
DOKPLOY_READ_ONLY=false
```

and the command includes:

```text
--apply
```

- [ ] **Step 5: Verify client syntax**

Run:

```powershell
rtk proxy node --check C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs
```

Expected: exit code `0`.

## Task 4: Verify Inventory And Audit

**Files:**
- None

- [ ] **Step 1: Inventory**

Run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs inventory
```

Expected includes:

```text
project: agency-agents
environment: production
```

- [ ] **Step 2: Audit**

Run:

```powershell
rtk proxy node C:/Users/ppnh1/.codex/skills/dokploy-operator/scripts/dokploy-client.mjs audit
```

Expected:

```text
project.all: ok
application.create: available
postgres.create: available
redis.create: available
application.saveGithubProvider: unsafe or disabled
```

## Task 5: Update Project-Level Env Template

**Files:**
- Create or modify: `deploy/dokploy.operator.env.example`

- [ ] **Step 1: Add per-project template**

Use:

```bash
# Per-project Dokploy deployment config. No API key here.
DOKPLOY_PROJECT_NAME=<project-name>
DOKPLOY_ENVIRONMENT_NAME=production
DOKPLOY_DEPLOY_MODE=custom-git
DOKPLOY_GIT_URL=https://github.com/hungpixi/<repo>.git
DOKPLOY_BRANCH=main
DOKPLOY_DOMAIN=<optional-domain>
DOKPLOY_CREATE_POSTGRES=false
DOKPLOY_CREATE_REDIS=false
DOKPLOY_MOUNTS=
```

- [ ] **Step 2: Document separation**

State:

```text
Global operator secrets live in C:/Users/ppnh1/.codex/secrets/dokploy.env.
Project deployment choices live in deploy/dokploy.operator.env.
```

## Success Criteria

- The reusable skill exists under Codex skills.
- The Dokploy API key is stored outside project repos.
- `inventory` works without leaking secrets.
- `audit` classifies endpoints without creating or deleting resources.
- Future projects can use the same operator skill by providing only project-level deploy config.
- Destructive cleanup is opt-in and cannot happen during endpoint probing.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-reusable-dokploy-operator-skill.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch implementation of the local skill/client, then review and run inventory/audit in main rollout.
2. **Inline Execution** - Implement the skill/client directly in this session with checkpoints.

Given this touches secrets and real infrastructure, prefer Inline Execution for env movement and API verification.
