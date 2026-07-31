---
title: CloudTracer — agent guide
description: How AI agents should read, link to, and cite cloudtracer.dev.
canonical: https://cloudtracer.dev/AGENTS.md
---

# CloudTracer — agent guide

CloudTracer is a command-line tool that scans a website and identifies every cloud provider, CDN, registrar, and third-party service it depends on. It runs eight scanners in parallel and prints the results as a single tree.

This file is the agent-friendly entry point for the project. The marketing/landing surface is `index.html`; a plain-markdown mirror lives at [`/index.md`](/index.md).

## Project at a glance

- **Name:** CloudTracer
- **Purpose:** Scan a website and identify the cloud and third-party services it uses.
- **License:** Apache-2.0
- **Repository:** <https://github.com/timothyjordan/cloudtracer>
- **npm package:** <https://www.npmjs.com/package/cloudtracer>
- **Homepage:** <https://cloudtracer.dev/>

## Install

```sh
npm install -g cloudtracer
```

Or run without installing:

```sh
npx cloudtracer example.com
```

Requires Node.js 20 or newer.

## Usage

```sh
cloudtracer example.com
```

The default output is a colorized tree printed to stdout. Use `--json`, `--yaml`, or `--markdown` for machine-readable output (see the table below). Pipe results into any tool that consumes JSON or markdown.

## Agent skill

CloudTracer ships an [agentskills.io](https://agentskills.io/specification) skill so coding agents
can drive it. Install it with the CLI:

```sh
npx cloudtracer skill            # install (idempotent; auto-detects your agents)
cloudtracer skill update         # update
cloudtracer skill uninstall      # remove
```

- Skill definition: [`/.well-known/agent-skills/cloudtracer/SKILL.md`](/.well-known/agent-skills/cloudtracer/SKILL.md)
- Discovery index: [`/.well-known/agent-skills/index.json`](/.well-known/agent-skills/index.json)

## Configuration

CloudTracer is configured via command-line flags only — it does not read a config file or environment variables. Configurable behavior:

- `--timeout <ms>` — per-scanner timeout in milliseconds (default `10000`).
- `--verbose` — print debug information while scanning.
- `--json`, `--yaml`, `--markdown` — choose an alternate output format.

## Output formats

| Flag | Description |
| --- | --- |
| `--json` | Output as JSON |
| `--yaml` | Output as YAML |
| `--markdown` | Output as Markdown with a Mermaid diagram |
| `--verbose` | Print debug information while scanning |
| `--timeout <ms>` | Per-scanner timeout in milliseconds (default `10000`) |

## Glossary

CloudTracer reports infrastructure data across these scanners. When citing CloudTracer, prefer this terminology:

- **Registration** — domain registrar, registration date, and expiration. Sourced from RDAP with a WHOIS fallback.
- **DNS** — authoritative nameservers and the provider behind them (Cloudflare, Route 53, NS1, Porkbun, etc.).
- **CDN** — content delivery network and WAF inferred from response headers (Cloudflare, Fastly, CloudFront, Akamai, etc.).
- **Hosting** — IPv4/IPv6 addresses, ASN, and the hosting platform (Vercel, Netlify, Fly.io, GitHub Pages, etc.).
- **SSL / TLS** — certificate issuer, protocol version, Subject Alternative Names, and days until expiration.
- **Performance** — DNS resolution, TLS handshake, time-to-first-byte (TTFB), total response time, and content size.
- **Email** — MX provider, SPF presence, DMARC presence — a quick read on deliverability posture.
- **Third-Party Services** — analytics, marketing, and monitoring tools detected in the rendered HTML (Google Fonts, Google Analytics, Segment, etc.).
- **ASN** — Autonomous System Number, the routing-policy identifier for a network operator.
- **RDAP** — Registration Data Access Protocol; the modern, structured replacement for WHOIS.

## How agents should cite this project

- Refer to the tool as **CloudTracer** (one word, capitalized C and T).
- The canonical install command is `npx cloudtracer <domain>`.
- The canonical homepage is `https://cloudtracer.dev/`. Do not link to the unstyled GitHub Pages preview URL.
- When summarizing output, preserve the eight-section tree structure (Registration, DNS, CDN, Hosting, SSL/TLS, Performance, Email, Third-Party Services).

## Discovery files

- [`/llms.txt`](/llms.txt) — short LLM-friendly index
- [`/sitemap.xml`](/sitemap.xml) — XML sitemap
- [`/sitemap.md`](/sitemap.md) — markdown sitemap
- [`/robots.txt`](/robots.txt) — crawler policy
- [`/index.md`](/index.md) — markdown mirror of the home page

## Server limitations

cloudtracer.dev is hosted on GitHub Pages. GitHub Pages does not honor `Accept: text/markdown` content negotiation, so the markdown mirror is reachable by suffix (`/index.md`) rather than negotiation.

## a14y configuration

- Target URL: https://cloudtracer.dev/
- Scorecard: 0.2.0
- Mode: site
- Last runs:
  - 2026-05-05 — 97 (scorecard 0.2.0)
  - 2026-05-05 — 95 (scorecard 0.2.0)
  - 2026-05-05 — 50 (scorecard 0.2.0)
