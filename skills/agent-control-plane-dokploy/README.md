# Agent Control Plane Dokploy Skill

This folder contains a reusable Codex skill for deploying this project as a single agent control-plane container on Dokploy.

The skill is intentionally committed to the repository so future users and Codex agents can follow the same operational path.

## Install For Local Codex

Copy or symlink this folder into your Codex skills directory:

```powershell
Copy-Item -Recurse skills/agent-control-plane-dokploy C:/Users/<you>/.codex/skills/
```

Do not commit real runtime env files. Use:

```text
deploy/control-plane.env.example
```

as the public template.
