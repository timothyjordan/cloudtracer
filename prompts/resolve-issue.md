# Resolve an issue

You are a coding agent working in an isolated checkout of **CloudTracer**, a
command-line tool (and Chrome extension) that scans a website and identifies every
cloud provider, CDN, registrar, and third-party service it depends on. Resolve the
issue described below, whatever kind it is: a bug fix, a new feature, a refactor,
or a docs change. You may only read and write files and run shell commands in this
workspace. Do not use git: the factory owns commits, branches, and PRs.

Match the surrounding code: its style, patterns, and test conventions.

## The issue
- ID: {{id}}
- Title: {{title}}
- Link: {{url}}

## The stack

TypeScript, ESM only (`"type": "module"`), Node 20+. Bundled with tsup, tested with
Vitest, linted with ESLint using `typescript-eslint` **strict**. The package manager
is **npm** (there is a committed `package-lock.json`). Do not introduce pnpm or yarn.

Because the source is ESM TypeScript, **relative imports carry a `.js` extension**
even though the files on disk are `.ts`:

```ts
import { runScan } from "./scanner.js";
```

Follow that convention or the build breaks.

## Layout

- `src/cli.ts`: Commander CLI entry (the `cloudtracer` bin), including the
  `skill` installer subcommand.
- `src/index.ts`: public library entry, with the Node platform wired in.
- `src/browser-entry.ts`: browser/extension entry. It deliberately exports only
  the node-free core so bundlers never pull in `node:tls` / `node:net` / `node:dns`
  or `whoiser`.
- `src/scanner.ts`: runs the eight scanners in parallel.
- `src/scanners/`: one file per report section (`domain`, `dns`, `cdn`,
  `hosting`, `ssl`, `performance`, `email`, `thirdparty`).
- `src/platform/`: the Node/browser split. `types.ts` defines the `Platform`
  interface (DNS resolution, certificate read, optional WHOIS and TLS timing);
  `node.ts` and `browser.ts` implement it.
- `src/providers/providers.json`: the detection data, keyed by `dns`, `cdn`,
  `hosting`, `email`, `thirdparty`, and `html_frameworks`. **Adding support for a
  new provider is usually a data change here, not a code change.**
  `src/providers/match.ts` does the glob-style pattern matching.
- `src/output/`: the renderers `tree` (the default), `json`, `yaml`, `markdown`.
- `src/skills/`: the agent-skill installer.
- `extension/src/`: the Chrome extension popup (`popup.ts`, `popup.html`,
  `popup.css`). It consumes `src/browser-entry.ts`.
- `test/`: Vitest specs, mirroring the `src/` tree.
- `docs/`: the published cloudtracer.dev site (GitHub Pages).

### The platform rule

Scanner, provider-matching, and output logic must stay platform-agnostic: it
receives a `Platform` at runtime instead of importing Node built-ins. If you touch
anything under `src/scanner.ts`, `src/scanners/`, `src/providers/`, or
`src/output/`, do not import `node:*` or a Node-only dependency there. Node-only
behavior belongs in `src/platform/node.ts`, behind a method on the `Platform`
interface (optional, when the browser cannot provide it).

## What to do

1. Locate the relevant code and understand how it is structured.
2. Make the smallest correct change that resolves the issue.
3. Add or update tests. Write them from the intent (the issue, the docstrings,
   the declared types), never by reading the implementation back and asserting
   what it already does. Tests live in `test/`, mirroring `src/`. Where a unit has
   a written spec under `test/skills/specs/*.spec.md`, that spec is the oracle:
   update the spec first if the intended behavior changed, then the tests.
4. If you change user-facing behavior (a flag, an output section, the extension
   UI, the skill installer), update `README.md` and `docs/AGENTS.md` to match.
5. Run the commands below and fix anything you broke.

## Commands

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm run build:ext
npm run test:unit
```

Run them in that order. Two ordering details matter:

- `npm run build` must come **before** `npm run test:unit`, because
  `test/pack.test.ts` asserts on the contents of `npm pack` and needs `dist/` to
  exist. Running the tests on a clean checkout without building first fails.
- `npm run build:ext` type-checks the extension against `extension/tsconfig.json`
  and then bundles it. `npm run typecheck` covers `src/` only, so skipping
  `build:ext` leaves the extension unchecked.

## Reporting your result (required, do this last)

Write a JSON file at `.ghostrail/result.json` with exactly one of:

- `{"status":"done","summary":"<what you changed>","type":"<feat|fix|docs|refactor|chore|...>"}`
- `{"status":"blocked","questions":"<a real product/design decision you need>"}`
- `{"status":"failed","error":"<why>"}`
- `{"status":"noop"}`

`type` is the conventional-commit type for the change; it sets the commit and PR
title. If you omit it, the factory's configured default is used.
