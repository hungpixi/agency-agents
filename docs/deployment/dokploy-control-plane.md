# Dokploy Control Plane Deployment

Dokploy should host one long-running application:

```text
Project: agency-agents
Application: agency-control-plane
Dockerfile: apps/control-plane/Dockerfile
Port: 3000
Healthcheck: /healthz
Readiness: /readyz
```

Mount these persistent volumes:

```text
/data/agency
/data/control-plane
/data/jobs
```

Use `deploy/control-plane.env.example` as the environment template.

The first deploy does not require Redis or Postgres. The control-plane stores runtime state and job artifacts in mounted volumes. Dokploy API access is optional and should stay disabled unless the container needs infrastructure tools later.

After the app starts, sync the agent catalog:

```bash
curl -X POST https://<domain>/sync \
  -H "Authorization: Bearer <CONTROL_PLANE_TOKEN>"
```

Verify:

```bash
curl https://<domain>/healthz
curl https://<domain>/readyz
curl https://<domain>/agents \
  -H "Authorization: Bearer <CONTROL_PLANE_TOKEN>"
```
