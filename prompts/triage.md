# Triage an issue

You are triaging an issue in an isolated checkout of **CloudTracer**, a TypeScript
CLI and Chrome extension that scans a website and reports the cloud providers, CDN,
registrar, and third-party services behind it. Your job is NOT to fix the issue: it
is to decide whether it is too large to fix in one pass and, if so, propose how to
break it into smaller, ordered sub-issues. Do not use git and do not change any
source files except the two output files below.

## The issue
- ID: {{id}}
- Title: {{title}}
- Link: {{url}}

## How this codebase is shaped

Knowing the seams helps you judge scope and split along them:

- `src/scanners/`: eight independent scanners (`domain`, `dns`, `cdn`, `hosting`,
  `ssl`, `performance`, `email`, `thirdparty`), run in parallel by `src/scanner.ts`.
  Each is a natural, independently shippable unit.
- `src/providers/providers.json`: the detection data (`dns`, `cdn`, `hosting`,
  `email`, `thirdparty`, `html_frameworks`).
- `src/output/`: four renderers (`tree`, `json`, `yaml`, `markdown`).
- `src/platform/`: the Node/browser split behind a `Platform` interface.
- `src/cli.ts`: the Commander CLI, including the `skill` installer.
- `src/skills/`: the agent-skill installer internals.
- `extension/src/`: the Chrome extension popup, built on `src/browser-entry.ts`.
- `test/` mirrors `src/`; `docs/` is the published cloudtracer.dev site.

## What counts as right-sized here

**Atomic** (leave it alone) usually looks like:

- Adding or correcting detection patterns for one provider in `providers.json`,
  with tests.
- A fix or improvement inside a single scanner, renderer, or platform adapter.
- A new CLI flag with its help text, docs, and tests.
- A docs-only change under `docs/` or `README.md`.

**Too large** (propose a split) usually looks like:

- One issue that touches several scanners, or several output renderers, at once.
- A change that needs both a Node-side and a browser/extension-side
  implementation: the `Platform` interface change plus each adapter is more than
  one pass.
- "Add support for provider X everywhere" spanning DNS, CDN, hosting, and email
  detection.
- A refactor bundled together with a behavior change, or a feature bundled with
  its documentation rewrite of the whole site.

When a change crosses the platform seam, order the sub-issues so the shared
interface and the platform-agnostic core land first, then the Node adapter, then
the browser adapter and extension UI.

## What to do

1. Read the issue and enough of the codebase to judge its scope.
2. Decide:
   - **Atomic** — a single, focused change a coding agent can do in one pass.
   - **Too large** — spans several independent changes, or mixes unrelated
     concerns. Propose 2 to 6 sub-issues, each independently shippable, ordered so
     that dependencies come first.
3. Write the plan to `.ghostrail/triage.json` (schema below).
4. Write `.ghostrail/result.json` with `{"status":"done","summary":"<one line>"}`
   when you produced a plan, or `{"status":"blocked","questions":"<what you need>"}`
   if you genuinely cannot decide without a human.

## `.ghostrail/triage.json` schema

Atomic (no split):

```json
{ "status": "noop", "reason": "<why it is already the right size>" }
```

Split into sub-issues:

```json
{
  "status": "split",
  "reason": "<why it needs splitting>",
  "subIssues": [
    { "title": "First, self-contained step", "description": "<what and why>" },
    { "title": "Second step", "description": "<...>", "dependsOn": [0] }
  ]
}
```

- `dependsOn` lists the indices of earlier sub-issues (0-based, all strictly
  less than the current one) that must be done first.
- Keep titles imperative and specific. Each sub-issue should stand on its own.

The factory creates the sub-issues (unassigned) and a human assigns each to the
bot to start work; the parent leaves the triage queue.
