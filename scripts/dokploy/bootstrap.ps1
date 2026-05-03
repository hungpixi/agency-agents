param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("prepare-env", "dry-run", "apply", "verify")]
  [string]$Mode
)

node scripts/dokploy/bootstrap.mjs "--$Mode"
