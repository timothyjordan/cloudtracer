# AGENTS.md

> Precedence: closer subdirectory `AGENTS.md` files override root rules for their subtree, and direct user instructions in chat override file rules. Keep this root file as a concise Tier 1 map; place deep domain docs and runbooks in `.agents/references/` or `docs/`. Content outside `<!-- reporig:start -->` and `<!-- reporig:end -->` is owned by maintainers.

## This project

**cloudtracer**: TypeScript CLI, library, and Chrome extension that scans a website and identifies the cloud providers it uses. (Package manager: `npm`)

| Action | Command |
|---|---|
| Install | `npm install` |
| Dev | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm run test:unit` |

## Context map

- **Specs and plans:** Read and write approved specs and implementation plans in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- **Scoped rules (docs):** `docs/AGENTS.md`
- **Index:** `docs/index.md`
- **Privacy:** `docs/privacy.md`
- **Sitemap:** `docs/sitemap.md`

## Repo boundaries

- Protected or generated paths: `dist/**`, `dist-extension/**`

<!-- reporig:start -->
<!-- Managed by /reporig (.agents/reporig.json). Edit outside this fence or run /reporig to reconfigure. -->

## Workflow rules

1. **Sync first:** Check `git status` and pull the latest default branch from origin before starting new work.

2. **Branching:** Create a focused feature branch from the default branch before editing code; never commit directly to `main`.

3. **Intent and planning:** Write and get user approval on a spec and implementation plan in `docs/superpowers/specs/` and `docs/superpowers/plans/` before non-trivial code changes.

4. **Verification oracle:** Verify against written specs as a black-box oracle rather than mirroring implementation details. Cover user-facing UI flows with Playwright E2E tests (see `.agents/references/playwright-e2e.md`).

5. **Pre-commit checks:** Run `npm run lint`, `npm run typecheck`, `npm run test:unit` and confirm green output before committing.

6. **Commit and push cadence:** Commit atomically after each completed plan task; push the feature branch once all planned tasks and local checks pass.

7. **PR and merge gate:** Push the branch, provide step-by-step local test instructions (starting the dev server when applicable), and wait for explicit human sign-off on that test run before opening a PR via GitHub MCP or `gh pr create`; never merge without explicit user approval. Confirm GitHub Actions checks pass.

8. **Issue tracking:** Track all work in Linear (project: `CloudTracer`) through `Todo` -> `In Progress` -> `In Review` -> `Done`. Reference exact issue IDs in commits and PRs only when directly addressed.

## Autonomy boundaries

- **Always (autonomous):** Run local read-only repo inspection, linters, typechecks, and test suites.
- **Ask first (human gate):**
  1. Install new third-party dependencies.
  2. Edit applied database migrations or public API contracts.
  3. Modify CI/CD workflows or deployment configurations.
  4. Modify any sibling or external repository.
  5. Open a pull request only after explicit human sign-off on local verification.
- **Never (hard stops):**
  1. Commit, print, or expose `.env` files, API keys, tokens, or secrets.
  2. Hand-edit lockfiles or generated directories instead of running the package manager or generator.
  3. Delete or weaken failing spec tests to force a green build without user triage.
  4. Commit directly to `main` or force-push shared branches.
- **Protected paths (ask before editing):** `dist/**`, `dist-extension/**`.

## Tooling & references

- **SDLC providers:** Source: GitHub (`gh` CLI or GitHub MCP). Issues: Linear (project: `CloudTracer`). CI: GitHub Actions.
- **Vendored skills:** Load repository skills from `.agents/skills/` (linked at `.claude/skills/`; run `/reporig` to reconfigure workflows or update vendored packs).
- **Workflow spine:** Follow `obra/superpowers` skills in `.agents/skills/` across discovery, planning, implementation, and review.
- **Playwright E2E:** Follow `.agents/references/playwright-e2e.md` for selector, fixture, and browser test conventions.
- **Craft and domain packs:** Apply `cloudflare/security-audit-skill`, `trailofbits/skills#appsec`, `blader/humanizer`, `pbakaus/impeccable`, `emilkowalski/skills` (and 4 more in `.agents/reporig.json`) from `.agents/skills/`.
- **Linear CLI fallback:** Prefer the connected Linear MCP server; when unavailable in remote sessions, read and follow `.agents/references/linear-cli-shim.md` to bootstrap `.agents/references/linear-cli.mjs` (never hardcode keys).

## Writing style

- Use plain, direct English in specs, code comments, commit messages, PR descriptions, and documentation; avoid filler and buzzwords.
- Never use em dashes or spaced hyphens as sentence punctuation; use commas, colons, parentheses, or separate sentences instead.
<!-- reporig:end -->
