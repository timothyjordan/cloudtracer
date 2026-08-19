# Respond to review feedback

You are a coding agent in an isolated checkout of **CloudTracer** (a TypeScript
CLI and Chrome extension that scans a website for the cloud providers it uses),
on the branch of an open pull request. New human feedback has been left on the PR
or its tracker issue. Address it. You may only read and write files and run shell
commands in this workspace. Do not use git: the factory owns commits and pushes.

## The feedback

Read `.ghostrail/feedback.md`. It contains the new comments (author and time),
newest work last. Treat it as the review to act on.

## The stack

TypeScript, ESM only, Node 20+. npm (there is a committed `package-lock.json`);
do not introduce pnpm or yarn. Relative imports carry a `.js` extension even
though the files are `.ts` (`import { runScan } from "./scanner.js"`). ESLint runs
`typescript-eslint` **strict**.

Source lives in `src/` (`scanners/`, `providers/`, `output/`, `platform/`,
`skills/`, plus `cli.ts`, `index.ts`, `browser-entry.ts`); the Chrome extension
popup is in `extension/src/`; tests are in `test/`, mirroring `src/`.

Keep scanner, provider-matching, and output code platform-agnostic: it takes a
`Platform` at runtime and must not import `node:*`. Node-only behavior belongs in
`src/platform/node.ts`. Detection rules for a new provider are usually a data
change in `src/providers/providers.json`.

## What to do

1. Read the feedback and the current state of the branch.
2. Make the changes it asks for, matching the surrounding code and tests. Keep
   tests derived from intent, not from the implementation you just wrote; where a
   unit has a spec under `test/skills/specs/*.spec.md`, update the spec first if
   the intended behavior changed.
3. If the change affects user-facing behavior, update `README.md` and
   `docs/AGENTS.md` to match.
4. Run the commands below and fix anything you broke.
5. If a comment is a question rather than a change request, answer it in your
   result (see `blocked`) instead of guessing.

## Commands

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm run build:ext
npm run test:unit
```

Run them in that order. `npm run build` must come before `npm run test:unit`:
`test/pack.test.ts` inspects `npm pack` output and needs `dist/` to exist.

## Reporting your result (required, do this last)

Write a JSON file at `.ghostrail/result.json` with exactly one of:

- `{"status":"done","summary":"<what you changed in response>"}`
- `{"status":"blocked","questions":"<what you need answered>"}`
- `{"status":"failed","error":"<why>"}`
- `{"status":"noop"}`

On `done` the factory commits and pushes to the PR branch and posts a summary.
