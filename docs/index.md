---
title: CloudTracer — Know where any website really lives
description: CloudTracer scans a domain and prints registrar, DNS, CDN, hosting, SSL, email, and third-party services as a single tree.
canonical: https://cloudtracer.dev/
doc_version: 0.1.0
last_updated: 2026-05-05
---

# CloudTracer

> Know where any website really lives.

Audit your own stack, vet a vendor, or understand a competitor's infrastructure. CloudTracer scans a domain and prints registrar, DNS, CDN, hosting, SSL, email, and third-party services as a single tree.

## Install

```sh
npx cloudtracer example.com
```

Or globally:

```sh
npm install -g cloudtracer
cloudtracer example.com
```

Requires Node.js 20 or newer.

## Example output

```text
$ cloudtracer cloudtracer.dev

  🌐 cloudtracer.dev

  ├── Registration
  │   Registrar  : Porkbun LLC (RDAP)
  │   Registered : Apr 20, 2026
  │   Expires    : Apr 20, 2027
  ├── DNS
  │   Nameservers  : maceio.ns.porkbun.com, curitiba.ns.porkbun.com, fortaleza.ns.porkbun.com, salvador.ns.porkbun.com
  ├── CDN
  │   Fastly (Header: x-served-by: cache-sjc1000095-SJC; Header: x-fastly-request-id: 1f2c10441eb35c0440b9b87e9326d584ac80a36f)
  ├── Hosting
  │   Provider : Fastly
  │   ASN      : 54113 (FASTLY - Fastly, Inc., US)
  │   IPv4     : 185.199.110.153, 185.199.111.153, 185.199.108.153, 185.199.109.153
  │   IPv6     : 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8003::153, 2606:50c0:8002::153
  ├── SSL/TLS
  │   Issuer   : Let's Encrypt
  │   Protocol : TLSv1.3
  │   Expires  : Jul 19, 2026 (89 days remaining)
  │   SANs     : cloudtracer.dev, www.cloudtracer.dev
  ├── Performance
  │   DNS      : 14ms
  │   TLS      : 41ms
  │   TTFB     : 64ms
  │   Response : 68ms
  │   Size     : 3.2 KB
  └── Third-Party Services
      Fonts : Google Fonts
```

## Eight scanners, one tree

Each scan runs every layer in parallel. Here is what each row tells you.

### Who runs the domain

- **Registration** — registrar, registration date, and expiration via RDAP with a WHOIS fallback.
- **DNS** — authoritative nameservers and the provider behind them (Cloudflare, Route 53, NS1, and others).

### How it's served

- **CDN** — CDN and WAF detection from response headers (Cloudflare, Fastly, CloudFront, Akamai, and more).
- **Hosting** — IPv4/IPv6, ASN, and the hosting platform (including Vercel, Netlify, Fly.io, and GitHub Pages).
- **SSL / TLS** — issuer, protocol version, SANs, and days-until-expiry with traffic-light coloring.
- **Performance** — DNS resolution, TLS handshake, TTFB, total response time, and content size.

### What's bolted on

- **Email** — MX provider, SPF and DMARC presence — a quick read on deliverability posture.
- **Third-Party Services** — analytics, marketing, and monitoring tools embedded in the page, scraped from the rendered HTML.

## Options

| Flag | Description |
| --- | --- |
| `--json` | Output as JSON |
| `--yaml` | Output as YAML |
| `--markdown` | Output as Markdown with a Mermaid diagram |
| `--verbose` | Print debug information while scanning |
| `--timeout <ms>` | Per-scanner timeout in milliseconds (default `10000`) |

## Pipe it anywhere

```sh
cloudtracer example.com --json | jq '.hosting'
cloudtracer example.com --markdown > report.md
```

## Sitemap

- [Home](https://cloudtracer.dev/)
- [Markdown mirror](https://cloudtracer.dev/index.md)
- [Agent guide & glossary](https://cloudtracer.dev/AGENTS.md)
- [llms.txt](https://cloudtracer.dev/llms.txt)
- [sitemap.xml](https://cloudtracer.dev/sitemap.xml)
- [sitemap.md](https://cloudtracer.dev/sitemap.md)

## Links

- Source: <https://github.com/timothyjordan/cloudtracer>
- npm: <https://www.npmjs.com/package/cloudtracer>
- Agent guide: [AGENTS.md](AGENTS.md)
- License: Apache-2.0
