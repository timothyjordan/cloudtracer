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

## Chrome extension

CloudTracer also runs as a Chrome extension: click the toolbar icon to scan the
domain of the tab you're on and see its cloud stack in a popup dashboard. The
extension runs entirely client-side (no backend) using DNS-over-HTTPS, RDAP, and
Certificate Transparency logs.

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

## License

Apache 2.0
