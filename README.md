# CloudTracer

Scan a website and identify all the cloud providers it uses — domain registration, DNS, CDN, hosting, SSL/TLS, email, and third-party services.

## Quick Start

```bash
npx cloudtracer example.com
```

## Install

Or install globally for repeated use:

```bash
npm install -g cloudtracer
```

## Usage

```bash
cloudtracer example.com
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--yaml` | Output as YAML |
| `--markdown` | Output as Markdown with Mermaid diagram |
| `--verbose` | Show debug information |
| `--timeout <ms>` | Per-scanner timeout in milliseconds (default: 10000) |

## Agent skill

CloudTracer ships an [agent skill](https://agentskills.io/specification) so AI coding agents
(Claude Code, Codex, Cursor, OpenCode, and others) know how to run it. Install it into the agents
you use with the CLI:

```bash
npx cloudtracer skill            # install (auto-detects your configured agents)
cloudtracer skill update         # pull the latest version
cloudtracer skill uninstall      # remove it
```

The command is idempotent — it auto-detects your coding agents, shows a checklist, and only writes
what changed. Useful flags:

| Flag | Description |
|------|-------------|
| `--project` | Guided install into the current repo so collaborators share the skill |
| `--check` | Report what would change without writing (exits 1 on drift) |
| `--agent <name>` | Restrict to one agent (repeatable) |
| `--target <dir>` | Write to `<dir>/cloudtracer/SKILL.md`, bypassing auto-detection |
| `-y, --yes` | Skip the checklist and act on all detected agents |

The skill definition lives at [`skills/cloudtracer/SKILL.md`](skills/cloudtracer/SKILL.md) and is
also discoverable from the live site at
`https://cloudtracer.dev/.well-known/agent-skills/cloudtracer/SKILL.md`.

## Chrome extension

CloudTracer also runs as a Chrome extension: click the toolbar icon to scan the
domain of the tab you're on and see its cloud stack in a popup dashboard. The
extension runs entirely client-side (no backend) using DNS-over-HTTPS, RDAP, and
Certificate Transparency logs.

### Install a released build

Each extension release attaches a Chrome Web Store-ready zip to its GitHub
Release. Grab `cloudtracer-extension-<version>.zip` from the
[latest `extension-v*` release](https://github.com/timothyjordan/cloudtracer/releases),
unzip it, and load the folder with **Load unpacked** as below.

### Build and load

```bash
npm install
npm run build:ext    # type-check and bundle the extension into dist-extension/
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist-extension/` folder

Use `npm run dev:ext` for a watch build while developing.

> Note: the SSL/TLS card is derived from Certificate Transparency logs (crt.sh),
> which is best-effort and occasionally unavailable. The CLI reads the live
> certificate directly instead.

## Releasing

The CLI and the extension version independently, both driven by release-please
from Conventional Commits. Merging the bot's release PR publishes `cloudtracer`
to npm and attaches a fresh extension zip to a GitHub Release. See
[RELEASING.md](RELEASING.md).

## License

Apache 2.0
