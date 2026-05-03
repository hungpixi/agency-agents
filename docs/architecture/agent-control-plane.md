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
