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

## License

Apache 2.0
