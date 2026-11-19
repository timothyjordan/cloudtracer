---
name: reporig-audit
description: Use when evaluating or auditing a repository's AGENTS.md, CLAUDE.md, references, and skills for three-tier progressive disclosure, token efficiency, and context bloat.
---

# Reporig Context Audit (`/reporig-audit`)

Evaluate a repository's existing agent instruction files, references, and installed skills against Three-Tier Progressive Disclosure, and deliver concrete, file-specific recommendations without mutating the repository.

## Why Three-Tier Progressive Disclosure

1. **Tier 1 (Hot / Always-On Root Index):** Root `AGENTS.md` (bridged by `CLAUDE.md` via `@AGENTS.md`) plus lightweight `SKILL.md` YAML frontmatter metadata. Loaded on every turn. Keep root `AGENTS.md` at or under `100` lines (`130` line ceiling, `85` managed line ceiling, `16,000` bytes) as a routing table of contents: concise project identity, canonical commands, safety boundaries, core workflow gates, and a `## Context map` of pointers.
2. **Tier 2 (Scoped / Activated Context):** Subdirectory `<subdir>/AGENTS.md` overrides for package-specific rules, glob-scoped rules, and activated `.agents/skills/<name>/SKILL.md` bodies (`<= 500` lines) loaded only when a task enters that domain.
3. **Tier 3 (Cold / On-Demand References and Scripts):** Deep architecture guides, API conventions, database or deployment runbooks, schemas, and deterministic scripts under `.agents/references/*`, `docs/*`, and skill `references/` or `scripts/`, fetched only when needed.

## Core Rules

1. **Strictly read-only:** Never create, edit, rename, or delete repository files while running `/reporig-audit`. Evaluation only inspects and recommends; applying changes happens via `/reporig` after explicit user confirmation.
2. **Resolve the single-sourced `reporig` CLI first:** Set `<skill-dir>` to the directory containing this `SKILL.md` file, then resolve the CLI in this exact priority order:
   1. If `<skill-dir>/../reporig/scripts/cli.mjs` exists, run `node <skill-dir>/../reporig/scripts/cli.mjs audit --cwd <repo>`.
   2. Else if `<repo>/.agents/skills/reporig/scripts/cli.mjs` exists, run `node <repo>/.agents/skills/reporig/scripts/cli.mjs audit --cwd <repo>`.
   3. Else run `npx --yes reporig audit --cwd <repo>`.
   Never duplicate scripts into `skills/reporig-audit/` and never hand-count lines or pointers without running the `audit` subcommand first.

## Audit Workflow

### Step 1: Run Deterministic Three-Tier Telemetry

Run the `audit` subcommand against `<repo>` and parse its JSON output (`status`, `needsProgressiveDisclosureMigration`, `budgets`, `tier1`, `tier2`, `tier3`, and `findings`).

### Step 2: Semantic Review of Flagged Files and Sections

Read root `AGENTS.md` (when present) plus any files listed in `tier1.otherAlwaysOnFiles` or `tier1.pointers.unindexedDocs` so your recommendations distinguish stale or duplicate prose from genuine domain knowledge:

1. **Stale commands or outdated project facts:** Recommend updating in Tier 1 `## This project` or deleting.
2. **Linter/formatter minutiae or rules duplicating `reporig` managed workflow gates:** Recommend removing from prose rather than archiving into `.agents/references/`.
3. **Package-specific or service-specific conventions (targeting one workspace directory in `tier2.workspacePackages`):** Recommend moving to Tier 2 `<subdir>/AGENTS.md` and adding a 1-line pointer under `## Context map` in root `AGENTS.md`.
4. **Deep architecture essays, API conventions, database/deployment runbooks, or directory trees (`monolithic-wiki-sections` / `tier1-over-ceiling`):** Recommend extracting to Tier 3 `.agents/references/<slug>.md` (or linking an existing `docs/*` guide in place so public documentation sites under `docs/` stay clean) and replacing with a 1-line `## Context map` pointer in root `AGENTS.md`.
5. **High always-on skill metadata (`skill-metadata-bloat`):** Inspect `tier2.skills.unfilteredMultiSkillPacks` and recommend narrowing irrelevant framework or platform sub-skills using per-pack `selectedSkills` filtering in `.agents/reporig.json` via `/reporig`.

### Step 3: Present the Three-Tier Context Scorecard

Report results concisely in four parts:

1. **Overall Status:** `healthy`, `needs-recommendations`, or `needs-migration`.
2. **Tier Telemetry Summary:**
   1. **Tier 1 (Always-On):** `AGENTS.md` line/byte count vs `100` target / `130` ceiling, extra always-on root files (`CLAUDE.md`, `.cursorrules`, Copilot/Cursor global rules), broken pointers, and combined always-on token estimate (`tier1.combinedAlwaysOnTokens` = root instructions + skill frontmatter metadata).
   2. **Tier 2 (Scoped / Activated):** Nested `<subdir>/AGENTS.md` files, glob-scoped rule files, and installed skill count (`tier2.skills.installedCount`, `oversizedSkills`).
   3. **Tier 3 (Cold On-Demand):** Managed and custom `.agents/references/*` files and repository `docs/*` guides (calling out any `unindexedDocs` missing from `## Context map`).
3. **Prioritized Findings and Concrete Migration Plan:** Group findings by severity (`high`, `medium`, `low`) and specify exact before/after actions per section and file (what stays in Tier 1 `AGENTS.md`, what gets deleted as duplicate/stale, what moves to `<subdir>/AGENTS.md`, and what moves to `.agents/references/<slug>.md`).
4. **Handoff:** Offer to run `/reporig` to apply the recommended Three-Tier Progressive Disclosure updates deterministically with `--dry-run` preview.
