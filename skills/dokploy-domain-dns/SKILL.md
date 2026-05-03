---
name: dokploy-domain-dns
description: Guide and verify DNS/domain setup for Dokploy-hosted apps, including A records, nameserver checks, Dokploy domain attachment, propagation waiting, and public HTTPS health verification.
---

# Dokploy Domain DNS

Use this skill when a user needs to connect a domain or subdomain to a Dokploy application.

## Core Flow

1. Choose a subdomain, usually not the apex domain.
2. Resolve the Dokploy host IP.
3. Check authoritative nameservers at the TLD first.
4. If the domain is still delegated to a slow host DNS provider such as Vinahost, recommend switching nameservers to Cloudflare.
5. In Cloudflare, create DNS-only A records for each Dokploy app subdomain.
6. Verify public DNS propagation.
7. Attach the domain to the Dokploy app.
8. Redeploy or refresh the app if needed.
9. Verify HTTPS health endpoint.

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

## Cloudflare Fast Path

Prefer Cloudflare DNS when the current DNS provider is slow to publish records.

1. Add the domain to Cloudflare.
2. Copy the two Cloudflare nameservers.
3. At the registrar/domain manager, replace the old nameservers with the Cloudflare nameservers.
4. Verify the `.com` TLD now delegates to Cloudflare before relying on Cloudflare records.
5. Add A records in Cloudflare:

```text
Type: A
Name: <subdomain>
Value: <Dokploy server IPv4>
Proxy status: DNS only
TTL: Auto
```

Keep Dokploy-hosted app records as **DNS only** at first. This lets Dokploy/Traefik issue Let's Encrypt certificates directly and avoids Cloudflare proxy masking origin HTTPS issues. Turn the orange cloud on later only after the app is healthy over HTTPS.

## Commands

Resolve Dokploy host:

```powershell
rtk proxy node -e "const dns=require('dns').promises; Promise.all([dns.lookup('dp.sgp1.w9.nu'), dns.resolve4('dp.sgp1.w9.nu')]).then(([lookup,a])=>console.log(JSON.stringify({lookup,a},null,2))).catch(e=>console.error(e.code||e.message))"
```

Resolve target domain:

```powershell
rtk proxy node -e "const dns=require('dns').promises; Promise.all([dns.lookup('<subdomain>'), dns.resolve4('<subdomain>')]).then(([lookup,a])=>console.log(JSON.stringify({lookup,a},null,2))).catch(e=>console.error(e.code||e.message))"
```

Check authoritative `.com` delegation:

```powershell
rtk proxy nslookup -type=ns <domain> a.gtld-servers.net
```

Cloudflare success looks like:

```text
<domain> nameserver = <name>.ns.cloudflare.com
<domain> nameserver = <name>.ns.cloudflare.com
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

If 1.1.1.1 sees Cloudflare nameservers but local Node DNS still sees the old provider, treat local DNS as cached. Continue using 1.1.1.1 or TLD checks as source of truth.

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
