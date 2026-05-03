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

## Is It Running Yet?

The repository code is runnable after it is pushed, but the system is not live until Dokploy has an application configured with:

```text
Repository: hungpixi/agency-agents
Branch: main
Dockerfile: apps/control-plane/Dockerfile
Port: 3000
Volumes: /data/agency, /data/control-plane, /data/jobs
Env: deploy/control-plane.env values
```

Dokploy should build and run this one app. Redis and Postgres are not required for the first version.

## Minimal User Setup In Dokploy UI

1. Open or create project `agency-agents`.
2. Create application `agency-control-plane`.
3. Select GitHub repo `hungpixi/agency-agents`, branch `main`.
4. Set Dockerfile path `apps/control-plane/Dockerfile`.
5. Set exposed port `3000`.
6. Add persistent volumes:

```text
/data/agency
/data/control-plane
/data/jobs
```

7. Paste environment variables from a filled copy of `deploy/control-plane.env.example`.
8. Deploy.

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
