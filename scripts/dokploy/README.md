# Dokploy Automation

Run from the repository root:

```powershell
rtk proxy node scripts/dokploy/bootstrap.mjs --prepare-env
rtk proxy node scripts/dokploy/bootstrap.mjs --dry-run
rtk proxy node scripts/dokploy/bootstrap.mjs --apply
rtk proxy node scripts/dokploy/bootstrap.mjs --verify
```

The script reads `deploy/dokploy.env`, uses `x-api-key` auth, and never prints secret values.
