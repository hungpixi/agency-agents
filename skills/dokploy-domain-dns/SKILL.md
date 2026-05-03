---
name: dokploy-domain-dns
description: Guide and verify DNS/domain setup for Dokploy-hosted apps, including A records, nameserver checks, Dokploy domain attachment, propagation waiting, and public HTTPS health verification.
---

# Dokploy Domain DNS

Use this skill when a user needs to connect a domain or subdomain to a Dokploy application.

## Core Flow

1. Choose a subdomain, usually not the apex domain.
2. Resolve the Dokploy host IP.
3. Tell the user exactly which DNS record to create.
4. Verify public DNS propagation.
5. Attach the domain to the Dokploy app.
6. Redeploy or refresh the app if needed.
7. Verify HTTPS health endpoint.

## Recommended Record

For an app named `agency-control-plane`, prefer:

```text
agency.<domain>
```

Record:

```text
Type: A
Name: agency
Value: <Dokploy server IPv4>
TTL: 300 or Auto
Proxy: DNS only if using Cloudflare
```

If the DNS manager requires FQDN:

```text
agency.example.com.
```

## Commands

Resolve Dokploy host:

```powershell
rtk proxy node -e "const dns=require('dns').promises; Promise.all([dns.lookup('dp.sgp1.w9.nu'), dns.resolve4('dp.sgp1.w9.nu')]).then(([lookup,a])=>console.log(JSON.stringify({lookup,a},null,2))).catch(e=>console.error(e.code||e.message))"
```

Resolve target domain:

```powershell
rtk proxy node -e "const dns=require('dns').promises; Promise.all([dns.lookup('<subdomain>'), dns.resolve4('<subdomain>')]).then(([lookup,a])=>console.log(JSON.stringify({lookup,a},null,2))).catch(e=>console.error(e.code||e.message))"
```

Verify HTTPS:

```powershell
rtk proxy node -e "fetch('https://<subdomain>/healthz').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>console.log(JSON.stringify({error:e.code||e.message})))"
```

## Interpretation

If DNS returns:

```text
ENOTFOUND
```

then public DNS cannot see the record yet. Causes:

- propagation delay
- record created in the wrong DNS provider
- domain nameservers do not point to the DNS manager being edited
- typo in subdomain

If DNS resolves but HTTPS fails:

- domain may not be attached in Dokploy
- certificate may still be issuing
- app may not be listening on the configured port
- health path may be wrong

## Safety Rules

- Do not tell the user setup is complete until public DNS resolves and `/healthz` returns 200.
- Do not move apex/root domain unless the user explicitly asks.
- Prefer subdomains for apps.
- Do not expose authenticated app routes in examples without bearer token.
