---
name: reporig
description: Use when setting up a repository for AI coding agents, generating or updating AGENTS.md workflow rules, configuring SDLC presets, autonomy gates, or tool providers like Linear and GitHub, or checking and updating vendored repository skills.
---

# Reporig (`/reporig`)

Rig a repository with portable, zero-trust agent rules, curated vendored skills, and deterministic `AGENTS.md` updates across coding harnesses.

## Core Rules

1. **Resolve `<skill-dir>` first:** Set `<skill-dir>` to the directory containing this `SKILL.md` file (whether loaded from a global skill folder, a harness plugin, `skills/reporig`, or a repo-vendored `.agents/skills/reporig` copy).
2. **Always invoke the engine via `node`:** Run `node <skill-dir>/scripts/cli.mjs <subcommand> ...` for every inspection, audit, preset draft, profile operation, validation, apply, `check-upgrades`, `draft-upgrades`, `ack-upgrades`, and update check. Never invoke bare script paths without `node` and `<skill-dir>/`, because plugin packagers strip executable bits and current working directories vary.
3. **Deterministic rendering and Three-Tier Progressive Disclosure:** Keep root `AGENTS.md` as a concise Tier 1 routing map (`<= 100` target lines, `130` line ceiling, `85` managed line ceiling) with a `## Context map` of pointers to Tier 2 (`<subdir>/AGENTS.md` and `SKILL.md` bodies) and Tier 3 (`.agents/references/*` and `docs/*`). Never hand-edit content inside `<!-- reporig:start -->` and `<!-- reporig:end -->`, never hand-edit `<repo>/AGENTS.md` directly prior to `cli.mjs apply`, never invent bespoke `.harness/` manifests or custom hook scripts, and never hand-write stub skills in `.agents/skills/` for upstream packs. Always write configuration drafts to a temporary scratch `<draft-json>` file outside `<repo>/.agents/reporig.json` (never edit `<repo>/.agents/reporig.json` directly prior to `cli.mjs apply`), write any user-approved brownfield non-managed header reconciliation to a temporary scratch `<header-md>` file outside `<repo>/AGENTS.md`, write any extracted reference or scoped `AGENTS.md` prose to temporary scratch files outside `<repo>/.agents/references/` and `<repo>/<subdir>/AGENTS.md`, and pass `--config <draft-json>` to `validate`, `apply --dry-run`, and `apply` (plus `--non-managed-header <header-md>` to `apply --dry-run` and `apply` when chosen by the user, alongside repeatable `--write-reference <name.md>=<scratch-file>` and `--write-scoped-agents <rel-dir>=<scratch-file>`) so `node <skill-dir>/scripts/cli.mjs apply` generates `AGENTS.md`, `CLAUDE.md`, `.agents/references/*`, `<subdir>/AGENTS.md`, `.gitignore` hygiene, `.agents/skills/*` (linked at `.claude/skills`), and normalized `.agents/reporig.json`.
4. **Preserve human repo notes:** Content outside `<!-- reporig:start -->` and `<!-- reporig:end -->` belongs to maintainers. Never silently delete or overwrite existing custom prose in `AGENTS.md` or `CLAUDE.md`; reconcile non-managed headers via `--non-managed-header <header-md>`, extract deep wiki sections via `--write-reference` or `--write-scoped-agents`, and bridge migrated `CLAUDE.md` prose via `--replace-claude-md` only when explicitly confirmed by the user.
5. **Zero secrets in tracked files:** Never write API keys, tokens, or `.env` values into `.agents/reporig.json`, `AGENTS.md`, or `.agents/references/`.
6. **Neutral presets, explicit runtime recommendations:** Present `SDLC_PRESETS`, `CURATED_SPINES`, and `CURATED_SKILLS` strictly from their neutral definitions in `<skill-dir>/scripts/catalog.mjs`. Never bake personal prose rules or unconfigured tools into preset descriptions; propose user-specific overrides only when backed by existing repository files, global rules already loaded in session context, or an opt-in local file scan.

## Step 0: Inspect Repository and Route Mode

Before asking questions or editing files, run:

```bash
node <skill-dir>/scripts/cli.mjs inspect --cwd <repo>
```

Route strictly on the JSON output and user arguments:

- **`/reporig audit` requested by user (or pure read-only evaluation request):** Run `node <skill-dir>/scripts/cli.mjs audit --cwd <repo>`, inspect any flagged files or sections semantically, and present a read-only Three-Tier Context Scorecard and migration recommendations without mutating files (same contract as `/reporig-audit`). Offer to run `/reporig` Setup or Update Mode only if the user wants to apply changes.
- **`/reporig reset` requested by user:** If `existingFiles.reporigJson` is `true`, show a brief summary of the existing `.agents/reporig.json` and ask for explicit confirmation before re-running **Setup Mode** over it. If `false`, proceed directly to **Setup Mode**.
- **`mode === "setup"`:** Follow **Setup Mode** below.
- **`mode === "update"`:** Follow **Update Mode** below.
- **`mode === "invalid-config"`:** Show `configErrors` to the user and ask whether to repair `.agents/reporig.json` (validate with `node <skill-dir>/scripts/cli.mjs validate --config <repo>/.agents/reporig.json` and re-route to Update Mode) or run a fresh Setup Mode configuration.

### Non-Interactive and Autonomous Invocations

If the user or an automated test harness provides explicit configuration choices upfront and instructs `/reporig` to run non-interactively (without pausing for interview questions), still execute the full `cli.mjs` pipeline (`inspect` -> `preset` -> customize JSON -> `validate` -> `apply --dry-run` -> `apply` in Setup Mode, or `inspect` -> `check-updates` -> `check-upgrades` -> `draft-upgrades` / `ack-upgrades` / `apply` -> `update-skills` in Update Mode). When invoked headlessly to check updates or inspect, report pending `check-upgrades` items without mutating workflow rules unless explicit caller instructions accept specific upgrades. Never bypass `cli.mjs` or hand-craft `AGENTS.md` when running headlessly.

When `inspect.brownfield.hasFootprint` is `true` in a non-interactive Setup Mode run, honor explicit brownfield flags or reconciliation directives provided by the caller. When the caller gave no explicit prose-editing directive, preserve existing `AGENTS.md` and `CLAUDE.md` text verbatim (omit `--non-managed-header`, `--replace-claude-md`, `--prune-skills`, and `--remove-legacy-files`) and pass `--adopt-skills <overlapping-recognized-skills>` whenever selected `skills.packs` overlap `brownfield.skills.recognizedPacks` (`matchedSkills`) so headless setup adopts recognized pack skills in place without creating prefixed duplicate directories.

If `cli.mjs apply` fails solely because `github.com` is unreachable in an offline sandbox (and no local git pack URLs were supplied):
1. In interactive runs, report the network error and ask whether to retry with network permission or run `node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> --skip-skills`.
2. In explicitly non-interactive offline test runs, fall back to `node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> --skip-skills` and note that remote pack cloning was skipped offline; never invent hand-written stub `SKILL.md` files to mimic upstream packs.

## Setup Mode (`mode === "setup"`)

Share a concise summary of detected signals from `inspect` (`projectName`, `languages`, `packageManager`, `commands`, `gitRemoteHost`, `ciProvider`, and `brownfield.hasFootprint`).

### Brownfield Inventory (when `brownfield.hasFootprint` is `true`, or during `/reporig reset` when existing instruction files or skills are present)

Before Stage 1, run `node <skill-dir>/scripts/cli.mjs audit --cwd <repo>`, read the detected repo-local instruction files inside `<repo>` (`AGENTS.md` or `agents.md`, non-bridge `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, and `.github/copilot-instructions.md`), and summarize what the repository already has:
1. **Existing instruction files, rules, and Three-Tier Progressive Disclosure telemetry:** Which files exist, their headings and topics, any commands, architecture boundaries, `protectedPaths`, or workflow rules already documented, plus Tier 1 line/token budget findings (`monolithic-wiki-sections`, `tier1-over-ceiling`, `broken-context-pointers`, and `unindexedDocs`).
2. **Existing skills:** Recognized upstream packs in `brownfield.skills.recognizedPacks` (matched via `skills-lock.json` or catalog skill names) and repository-specific skills in `brownfield.skills.customSkills` across `.agents/skills/` and `.claude/skills/`.

### Saved Preference Profiles (`cli.mjs profiles`)

Next, check whether the user has saved preference profiles (`$XDG_CONFIG_HOME/reporig/profiles.json` or `~/.config/reporig/profiles.json`):

```bash
node <skill-dir>/scripts/cli.mjs profiles list
```

1. **If `profiles` is non-empty in interactive runs:** Give the user the option to apply any of their saved profiles (listing each profile's `name` and 1-line `summary`) or use the setup questionnaire.
   1. **Saved Profile Fast Path:** When the user picks a saved profile, run:
      ```bash
      node <skill-dir>/scripts/cli.mjs profiles draft --name <profile-name> --cwd <repo>
      ```
      Note any repository `adaptations` (such as `sdlc.e2eTool`), ask the user to confirm, update, or clear `providers.issues.projectHint` whenever listed in `confirmationsNeeded`, set a concise 1 to 2 sentence `project.description`, write `<draft-json>` to a temporary scratch file outside `<repo>/.agents/reporig.json`, and jump directly to **Stage 4 Step 3** (`validate` -> optional Brownfield Reconciliation when `brownfield.hasFootprint` is `true` -> `apply --dry-run` -> `apply`).
2. **Questionnaire Path (when `profiles` is empty or the user chooses the questionnaire):** Before Stage 1 in interactive runs, offer an **Optional Local Scan**: ask whether the user wants `/reporig` to scan third-party local agent configuration and rule files (`~/.claude/`, `~/.gemini/`, `~/.agents/`, `~/.codex/`, `~/.cursor/`, and local repository docs) to recommend custom `<owner>/<repo>` skill packs, SDLC providers, or workflow overrides. Aside from `reporig`'s own `profiles.json` managed via `cli.mjs profiles`, only read files outside `<repo>` when the user opts in; if they decline (or in headless runs without explicit permission), stay strictly inside `<repo>` and rely only on repository files and any global instructions already loaded in session context. Then walk through the 3-stage funnel.

### Stage 1: Curated Skill Packs, Line-Item Filtering, and Multi-Spine Precedence

Present the curated spine and craft/verification catalog using smart defaults from `inspect` (`hasFrontendUi`, `hasWebSurface`, `hasPlaywright`, `languages`, and `stackSignals`):

- **Brownfield skill guidance (when `brownfield.hasFootprint` is `true`):** Highlight any packs in `brownfield.skills.recognizedPacks` already installed in the repo (recommending keeping them in `skills.packs` for SHA-tracked updates if still wanted) and confirm that repo-specific `brownfield.skills.customSkills` will be preserved (and consolidated from `.claude/skills/` if desired).
- **Per-pack line-item selection (`selectedSkills`):** Every spine and multi-skill craft/verification pack supports optional `selectedSkills: ["<skill-slug>", ...]` on its `skills.packs[]` entry. By default (when `selectedSkills` is omitted), all published skills passing the pack's `includePaths` and `excludePaths` install. Let the user uncheck individual skills inside any selected multi-skill pack (for example selecting `mattpocock/skills` with `selectedSkills: ["grill-me"]` alone) and record the checked subset in `selectedSkills`.
- **Bucket A: Lifecycle Spines (`kind: "spine"`, pick 0, 1, or multiple, with optional per-spine `selectedSkills`, plus custom `<owner>/<repo>` write-ins):**
  1. `obra/superpowers` (**Recommended default**): Brainstorming, specs, implementation plans, TDD, systematic debugging, and pre-completion verification.
  2. `mattpocock/skills`: Design grilling (`grill-me`, `grill-with-docs`), `/to-spec`, vertical-slice `/to-tickets`, TDD `/implement`, and `/code-review`.
  3. `addyosmani/agent-skills`: Define, plan, incremental build, verification, security and performance review, and ship gates.
  4. `EveryInc/compound-engineering-plugin`: Brainstorm, plan, work, review, and institutional knowledge compounding in `docs/solutions/`.
  5. `garrytan/gstack` (**Callout: filtered to the portable Markdown-only subset**; excludes Bun and compiled browser-binary skills `browse`, `qa`, `setup`, and `ship`): Founder scope review (`office-hours`, `plan-ceo-review`), `plan-eng-review`, `review`, `cso`, and `retro`.
  6. Custom GitHub `<owner>/<repo>` or git URL write-in (`kind: "spine"`).
- **Multi-spine conflict resolution (REQUIRED whenever 2 or more `spine` packs are selected):** Compute which lifecycle stages have 2 or more selected spines with active checked skills (honoring `selectedSkills` cherry-picks via `computeSpineStageConflicts`). Prompt the user to choose the stage owner for every conflicting stage (defaulting to `obra/superpowers` where present), auto-assign uncontested stages to the sole spine with checked skills in that stage, and record all 4 keys in `skills.spinePrecedence`:
  1. `discoverySpec`: Discovery and Spec Authoring
  2. `taskBreakdown`: Task and Ticket Breakdown
  3. `implementation`: Implementation and Testing Loop
  4. `codeReview`: Code Review and Pre-Ship Audit
  When 0 or 1 spine is selected, set `skills.spinePrecedence` to `null`.
- **Bucket B: Tier 1 Core Craft and Verification Skills (vendor-neutral, multi-select with smart defaults):**
  1. `cloudflare/security-audit-skill` (`kind: "verification"`, default ON): OWASP Top 10, auth, injection, secrets, and dependency security audits.
  2. `trailofbits/skills#appsec` (`kind: "verification"`, default ON): Differential security review, API sharp-edge checks, property-based testing, spec compliance, and static analysis.
  3. `blader/humanizer` (`kind: "craft"`, default ON): Strips formulaic AI phrasing and filler from documentation, comments, and copy.
  4. `pbakaus/impeccable` (`kind: "craft"`, default ON when `hasFrontendUi` is `true`): UI/UX layout, typography, accessibility, and design polish.
  5. `emilkowalski/skills` (`kind: "craft"`, default ON when `hasFrontendUi` is `true`): Interaction feel, spring physics, gesture responsiveness, and 60fps UI motion craft.
  6. `anthropics/skills#frontend-design` (`kind: "craft"`, opt-in alternative when `hasFrontendUi` is `true`): Aesthetic direction and anti-boilerplate visual hierarchy for web UIs.
  7. `addyosmani/web-quality-skills` (`kind: "verification"`, default ON when `hasWebSurface` is `true`): Core Web Vitals, WCAG accessibility, browser best practices, and SEO audits.
  8. `timothyjordan/a14y` (`kind: "craft"`, default ON when `hasWebSurface` is `true`): Web agent-readability (`llms.txt`, semantic HTML, markdown mirrors).
  9. `currents-dev/playwright-best-practices-skill` (`kind: "verification"`, suggested on web/Playwright repos, default ON when `hasPlaywright` is `true`): Resilient Playwright locators, fixture isolation, and zero-flake E2E patterns.
- **Bucket C: Tier 2 Open-Technology Stack Skills (deployment/cloud skills stripped; surfaced when matching stack signals exist, plus custom `<owner>/<repo>` write-ins):**
  1. `vercel-labs/agent-skills#writing-guidelines` (`kind: "craft"`, default ON): Active-voice technical docs, changelogs, and UI microcopy rules.
  2. `vercel-labs/agent-skills#react-web` (`kind: "craft"`, default ON when `stackSignals.hasReact` is `true`): React 19 component composition, async waterfall elimination, view transitions, and web interface guidelines (excludes `deploy-to-vercel` and Vercel CLI skills).
  3. **PostgreSQL choice (when `stackSignals.hasPostgres` is `true`, offer the choice between both packs or `none`):**
     1. `supabase/agent-skills#postgres-best-practices` (`kind: "craft"`, **Recommended default** when `stackSignals.hasPostgres` is `true`): Pure PostgreSQL indexing, query tuning, connection pooling, locking, and schema design (excludes Supabase BaaS SDK skill).
     2. `microsoft/postgres-skills#postgresql-best-practices` (`kind: "craft"`, opt-in alternative when `stackSignals.hasPostgres` is `true`): Deep 33-reference PostgreSQL DDL, partitioning, JSONB, RLS, pgvector, and vacuuming guide.
  4. `trailofbits/skills#modern-python` (`kind: "craft"`, default ON when `languages` includes `"python"`): `uv`, `ruff`, strict typing, `pytest`, and `pyproject.toml` craft.
  5. `samber/cc-skills-golang` (`kind: "craft"`, default ON when `languages` includes `"go"`): Idiomatic Go concurrency, context propagation, error handling, benchmarks, and testing.
  6. `morganlinton/BeautifulRust` (`kind: "craft"`, default ON when `languages` includes `"rust"`): Idiomatic Rust ownership, error modeling, unsafe invariants, and review checklists.
  7. `callstackincubator/agent-skills` (`kind: "craft"`, default ON when `stackSignals.hasReactNative` is `true`): React Native New Architecture rendering, list performance, and navigation patterns.
  8. `AvdLee/SwiftUI-Agent-Skill` (`kind: "craft"`, default ON when `stackSignals.hasSwift` is `true`): SwiftUI Observation state flow, view identity, and Swift 6 concurrency safety.
  9. Custom GitHub `<owner>/<repo>` or git URL write-in (`kind: "verification"`, `"craft"`, or `"custom"`), including any cloud-provider or platform-specific packs wanted by the team.

### Stage 2: SDLC Profile Preset and Mandatory PR Gate

1. Ask the user to select one of the 4 presets:
  1. `adversarial-zero-trust`: Written spec + plan before non-trivial code, black-box spec test oracle, full 3-tier autonomy boundaries, `all-work` issue lifecycle.
  2. `spec-driven`: Written spec + plan before non-trivial code, unit + integration tests for spec acceptance criteria, full 3-tier autonomy boundaries, `features-and-bugs` issue tracking.
  3. `test-driven`: Failing test first, strict Red-Green-Refactor loop, small green commits, full 3-tier autonomy boundaries, `existing-only` ticket updates.
  4. `lightweight`: Direct implementation with brief plans on multi-component changes, project checks + core tests before commit, essential safety boundaries, `none` mandatory tickets.
2. **Always explicitly ask for the PR and Human Verification Gate (`sdlc.prGate`):** Never assume the preset default silently in interactive runs. Present all 4 choices:
  1. `pr-with-test-plan` (Recommended general default): Push feature branch when automated checks pass, open a PR with step-by-step verification instructions, never merge without explicit human approval.
  2. `local-test-before-pr`: Push branch, provide step-by-step local test instructions (starting dev server when applicable), wait for explicit human sign-off on that local test run before opening a PR, and wait for explicit approval before merge.
  3. `direct-or-fast`: Commit on branch and ask before pushing or merging without mandatory PR ceremony.
  4. `custom`: User write-in policy stored in `sdlc.prGateCustom`.
3. Offer one-step acceptance of remaining preset defaults or targeted overrides (`commitCadence`, `pushCadence`, `e2eTool` such as `"playwright"`, `autonomy.askFirst`, `autonomy.never`, `autonomy.protectedPaths`, `writingStyle.plainEnglish`). When `brownfield.hasFootprint` is `true`, keep preset descriptions strictly neutral per Core Rule 6 while noting which neutral preset, `prGate`, `protectedPaths`, or `writingStyle.plainEnglish` setting aligns with rules already documented in the repo.

### Stage 3: SDLC Providers

`/reporig` configures every repository universally across coding harnesses (`AGENTS.md`, `CLAUDE.md`, `.agents/skills/*`, and `.claude/skills -> ../.agents/skills`), so do not ask the user which coding agent they use. Confirm the 4 provider slots (every slot supports `custom` write-ins; when `brownfield.hasFootprint` is `true`, highlight issue trackers or spec paths already evidenced by existing repo instruction files):

1. **Source Control (`providers.source`):** `github`, `gitlab`, `bitbucket`, `git-only`, or `custom` (`customName`, `notes`). Auto-default from `gitRemoteHost`.
2. **Issue Tracker (`providers.issues`):** `linear` (ask optional `projectHint` team/project name), `github-issues`, `jira`, `local-markdown`, `none`, or `custom`.
  1. **Linear CLI fallback (`providers.issues.includeCliFallback`):** Only when `linear` is selected, ask a quick yes/no question: *"Include bundled zero-dependency Linear CLI fallback for remote agents without MCP?"* Store the boolean in `providers.issues.includeCliFallback` (when `true`, `cli.mjs apply` renders `.agents/references/linear-cli-shim.md` and `.agents/references/linear-cli.mjs`; for all other issue trackers set `includeCliFallback: false`).
  2. **Reconcile `sdlc.issueCadence`:** If the user selects an active tracker while `sdlc.issueCadence` is `"none"`, ask which cadence to use (`all-work`, `features-and-bugs`, or `existing-only`). If `providers.issues.id` is `"none"`, set `sdlc.issueCadence` to `"none"`.
3. **CI Pipeline (`providers.ci`):** `github-actions`, `gitlab-ci`, `circleci`, `local-only`, `none`, or `custom`. Auto-default from `ciProvider`.
4. **Specs and Plans Home (`providers.specs`):** `in-repo` (defaults to `docs/superpowers/specs` and `docs/superpowers/plans` when `obra/superpowers` leads discovery, else `docs/specs` and `docs/plans`), `linear-docs`, `notion`, `confluence`, `none`, or `custom`.

### Stage 4: Generate Draft, Reconcile Brownfield Footprint, Dry-Run Preview, and Apply

1. Generate a schema-valid starter config from the chosen preset:
   ```bash
   node <skill-dir>/scripts/cli.mjs preset --id <preset-id> --cwd <repo>
   ```
2. Customize the JSON with the Stage 1 to 3 selections (including a concise 1 to 2 sentence `project.description`, confirmed `project.commands`, `sdlc`, `providers`, `skills.packs`, and `skills.spinePrecedence`) and write `<draft-json>` to a temporary scratch file outside `<repo>/.agents/reporig.json` (for example `/tmp/reporig-draft.json`). Never write or edit `<repo>/.agents/reporig.json` in place prior to `cli.mjs apply`.
3. Validate the config before applying:
   ```bash
   node <skill-dir>/scripts/cli.mjs validate --config <draft-json>
   ```
   Fix any reported `errors` before proceeding.
4. **Brownfield Reconciliation and Customization (when `brownfield.hasFootprint` is `true`, or during `/reporig reset` when existing instruction files or skills are present):** Present what changes are needed based on the user's Stage 1 to 3 answers and ask them to confirm or customize how instructions and skills should be reconciled:
  1. **Instructions (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, `.github/copilot-instructions.md`):** Show which existing rules duplicate the new managed `<!-- reporig:start -->` ... `<!-- reporig:end -->` section, which stale commands or paths need updating, which repo-specific superset notes belong in the Tier 1 top section of `AGENTS.md` (`## This project`, `## Context map`, `## Repo boundaries`), and which deep wiki/runbook sections (`> 25` lines) belong in Tier 2/3 files, then offer:
    1. **Option 1 (Recommended, Three-Tier Progressive Disclosure):** Deduplicate workflow overlaps and consolidate the concise Tier 1 repo-specific superset (including updated commands and a `## Context map` of pointers) into a temporary scratch `<header-md>` file outside `<repo>/AGENTS.md` (for example `/tmp/reporig-header.md`; never hand-edit `<repo>/AGENTS.md` directly before `cli.mjs apply`), extract inline wiki or runbook sections into scratch files passed via repeatable `--write-reference <slug.md>=<scratch-ref>` (linking existing `docs/*` files in place so public docs sites stay clean, and passing `--write-scoped-agents <rel-dir>=<scratch-scoped>` for directory-specific rules), pass `--non-managed-header <header-md>` (plus `--replace-claude-md` when folding standalone `CLAUDE.md` prose into `AGENTS.md`), and ask for explicit user confirmation before passing `--remove-legacy-files <csv>` for allowlisted legacy files (`.cursorrules`, `.cursor/rules/<file>`, `.github/copilot-instructions.md`, `skills-lock.json`).
    2. **Option 2:** Preserve existing `AGENTS.md` and `CLAUDE.md` prose verbatim and append the managed fence below (omit `--non-managed-header`, `--write-reference`, `--write-scoped-agents`, and `--replace-claude-md`).
    3. **Option 3:** Customize which sections stay in the Tier 1 `<header-md>` header versus which sections move to `.agents/references/` or `<subdir>/AGENTS.md` before applying.
  2. **Skills (`.agents/skills/`, `.claude/skills/`):** Offer:
    1. **Option 1 (Recommended):** Pass `--adopt-skills all` to adopt overlapping pack skills cleanly in place without `pack-*` prefix duplicates, pass `--migrate-claude-skills all` when `.claude/skills/` has separate skills to consolidate into `.agents/skills/`, and ask for explicit confirmation before passing `--prune-skills <csv>` for any previously installed pack skills deselected in Stage 1 (preserving `customSkills`).
    2. **Option 2:** Keep pre-existing skill directories untouched and let overlapping incoming pack skills install under prefixed names (omit `--adopt-skills`).
    3. **Option 3:** Customize adoption (`--adopt-skills <csv>`), migration (`--migrate-claude-skills <csv>`), and pruning (`--prune-skills <csv>`) per skill directory.
5. Preview all file mutations (including any selected `[brownfield-flags]`) with `--dry-run`:
   ```bash
   node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> [brownfield-flags] --dry-run
   ```
   Summarize what will be written (`AGENTS.md`, `CLAUDE.md`, `.agents/references/*`, `.agents/skills/*`, `.claude/skills`, `.gitignore`, `reconciledNonManagedHeader`, `wouldNormalizeCaseFrom`, `wouldAdoptDirs`, `wouldMigrateClaudeDirs`, `wouldPruneDirs`, and `legacyFilesWouldRemove`) and surface any warnings:
  1. If `agentsMd.appendedToUnfencedFile` is `true`, note that existing `AGENTS.md` content will be preserved verbatim at the top with the managed `<!-- reporig:start -->` ... `<!-- reporig:end -->` block appended below, and prompt the user to review their top section for overlapping rules.
  2. If `eslintWarning` is non-null, ask the user for confirmation to add `.agents/**` to ESLint `ignores` so vendored skill scripts do not trigger project lint rules.
  3. If `warnings` reports line or byte budget limits, offer to move lengthy maintainer prose into `.agents/references/`.
6. Run the real apply once confirmed (passing the exact same `[brownfield-flags]`, which writes normalized `<repo>/.agents/reporig.json` after syncing skills), then remove temporary `<draft-json>` and `<header-md>` scratch files:
   ```bash
   node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> [brownfield-flags]
   ```
7. **Check for saved profile match and offer to save on mismatch (interactive Setup Mode only):** After `cli.mjs apply` succeeds, check whether any saved profile already matches identically:
   ```bash
   node <skill-dir>/scripts/cli.mjs profiles match --config <repo>/.agents/reporig.json --cwd <repo>
   ```
   1. **If `matched` is `false`:** Offer to save this repository's portable preferences as a named profile. If the user accepts and chooses a `<profile-name>`, run:
      ```bash
      node <skill-dir>/scripts/cli.mjs profiles save --name <profile-name> --config <repo>/.agents/reporig.json
      ```
      (If `<profile-name>` already exists, ask for explicit confirmation before passing `--overwrite` or ask for a different name; users can also remove profiles on request via `node <skill-dir>/scripts/cli.mjs profiles delete --name <profile-name>`.)
   2. **If `matched` is `true`:** Do **not** offer to save a profile, because `matchedProfile` is already an identical match.
   3. **In non-interactive or autonomous runs:** Do not pause to prompt for saving a profile unless explicitly instructed by the caller.

## Update Mode (`mode === "update"`)

1. **Step 1 (Check upstream updates and sync self-vendored `reporig` first when outdated):**
   1. Run upstream update inspection:
      ```bash
      node <skill-dir>/scripts/cli.mjs check-updates --cwd <repo>
      ```
      (Pass `--self-url <url|none>` only when directed to check a custom self-repo remote or skip remote self-checks.)
   2. If `updates` contains `source === "timothyjordan/reporig"` with `hasUpdate: true`, inform the user (`currentSha` -> `remoteSha`) and ask to refresh `.agents/skills/reporig` first:
      ```bash
      node <skill-dir>/scripts/cli.mjs update-skills --cwd <repo> --packs timothyjordan/reporig
      ```
      When updated, set `<skill-dir>` to `<repo>/.agents/skills/reporig` for the rest of the run so `check-upgrades`, `validate`, and `apply` use the newly fetched rules.
2. **Step 2 (Evaluate `reporig` improvements, deprecations, and new options):**
   1. Run upgrade check:
      ```bash
      node <skill-dir>/scripts/cli.mjs check-upgrades --cwd <repo>
      ```
   2. Present a concise summary of `currentConfig` (`sdlc.preset`, `sdlc.prGate`, `providers`, installed `skills.packs` with short SHAs, and `previousReporigVersion` -> `currentReporigVersion`).
   3. If `vetoItems` is non-empty, present them as a numbered `[x]` **line-item veto list** (`title`, `rationale`, `recommendedAction`) so the user can accept all with a single "yes" or turn specific items off by number.
   4. If `questionnaireItems` is non-empty, ask each item in **questionnaire format** using its structured `options` (recommended option first).
3. **Step 3 (Additional manual changes, deterministic draft preview, and apply or ack):**
   1. Ask: *"Do you want to change any other part of your workflow, SDLC gates, providers, or selected skills?"*
   2. If any upgrade item (`requiresApply: true`), questionnaire selection, or manual edit is being applied:
      1. Build `<draft-json>` outside `<repo>/.agents/reporig.json` via:
         ```bash
         node <skill-dir>/scripts/cli.mjs draft-upgrades --cwd <repo> --out <draft-json>
         ```
         (Passing `[--veto <ids> | --accept <ids|none>]` and `[--answer <id=optionId> ...]`), and layer any requested manual edits onto `<draft-json>` (never editing `<repo>/.agents/reporig.json` in place prior to `apply`, because `apply` reads prior `<repo>/.agents/reporig.json` to diff `previousPacks` and prune removed `installedDirs`, and `--dry-run` must not mutate repository files). When `hygiene:progressive-disclosure` is accepted (or when the user manually requests `AGENTS.md` cleanup), run `node <skill-dir>/scripts/cli.mjs audit --cwd <repo>`, read `AGENTS.md` (and any unbridged `CLAUDE.md` or legacy files), synthesize an updated Tier 1 scratch `<header-md>` (updating stale commands/notes, deduplicating managed fence overlaps, and adding `## Context map` pointers) plus any extracted scratch files for `--write-reference <slug.md>=<scratch-ref>` and `--write-scoped-agents <rel-dir>=<scratch-scoped>`, and confirm the proposed reconciliation with the user before applying.
      2. Run validation and dry-run preview (including any `[progressive-disclosure-flags]` such as `--non-managed-header`, `--write-reference`, `--write-scoped-agents`, `--replace-claude-md`, or confirmed `--remove-legacy-files`):
         ```bash
         node <skill-dir>/scripts/cli.mjs validate --config <draft-json>
         node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> --dry-run
         ```
         Surface any warnings (`appendedToUnfencedFile`, `eslintWarning`, broken pointers, budgets).
      3. Run `apply` (passing the same `[progressive-disclosure-flags]` when accepted):
         1. Workflow or provider edits only (`skills.packs` and `skills.spinePrecedence` unchanged): pass `--skip-skills` so `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, and `.agents/references/*` update immediately without re-cloning packs:
            ```bash
            node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json> --skip-skills
            ```
         2. Skill pack or spine stage changes (`skills.packs` or `skills.spinePrecedence` added, removed, or re-ordered): omit `--skip-skills` so added packs install and removed packs (`skills.removedDirs`) prune cleanly:
            ```bash
            node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json>
            ```
         Remove the temporary `<draft-json>` file after `apply` succeeds, and apply any accepted `externalActions` (such as adding `.agents/**` to ESLint `ignores`).
   3. Else if `hasRecommendations` was `true` and the user vetoed all `requiresApply` items with zero manual edits:
      1. Apply any accepted `externalActions` if present, then run `ack-upgrades`:
         ```bash
         node <skill-dir>/scripts/cli.mjs ack-upgrades --cwd <repo>
         ```
         This saves vetoed IDs in `.agents/reporig.json` without mutating `AGENTS.md` or `.agents/references/*`.
         ```bash
         node <skill-dir>/scripts/cli.mjs ack-upgrades --cwd <repo>
         ```
         This saves vetoed IDs in `.agents/reporig.json` without mutating `AGENTS.md` or `.agents/references/*`.
4. **Step 4 (Remaining upstream skill pack updates):**
   1. Using the `check-updates` report (or re-running `node <skill-dir>/scripts/cli.mjs check-updates --cwd <repo>` if `skills.packs` changed in Step 3), present remaining packs with `hasUpdate: true`, plus `harnessNotes` and `externalLockCheck` when non-null.
   2. Ask which outdated packs to update and run:
      ```bash
      node <skill-dir>/scripts/cli.mjs update-skills --cwd <repo> --packs <comma-separated-sources>
      ```
      (Include `timothyjordan/reporig` in selective `--packs` if it was not already updated in Step 1, or omit `--packs` to refresh all configured packs and self-vendored `timothyjordan/reporig`; pass `--self-url <url|none>` when using a custom self-repo URL or skipping remote self-checks.) Report updated SHAs and refreshed skill directories.

## `.agents/reporig.json` Reference Example

Start from `node <skill-dir>/scripts/cli.mjs preset --id <preset-id> --cwd <repo>` and adapt fields to match this schema:

```json
{
  "schemaVersion": 1,
  "reporigVersion": "0.1.2",
  "evaluatedUpgrades": [],
  "project": {
    "name": "orbital-api",
    "description": "TypeScript ephemeris and telemetry service.",
    "packageManager": "pnpm",
    "commands": {
      "install": "pnpm install",
      "dev": "pnpm dev",
      "build": "pnpm build",
      "lint": "pnpm lint",
      "typecheck": "pnpm typecheck",
      "testUnit": "pnpm test:unit",
      "testE2e": "pnpm test:e2e"
    }
  },
  "harnesses": [],
  "customHarnesses": [],
  "sdlc": {
    "preset": "adversarial-zero-trust",
    "intentPlanning": "spec-and-plan",
    "verificationOracle": "adversarial-spec-oracle",
    "e2eTool": "playwright",
    "commitCadence": "per-task",
    "pushCadence": "when-all-tasks-complete",
    "prGate": "pr-with-test-plan",
    "prGateCustom": null,
    "mergeGate": "explicit-user-approval",
    "issueCadence": "all-work",
    "autonomy": {
      "askFirst": ["new-dependencies", "existing-migrations-and-contracts", "ci-and-deploy-configs", "other-repositories"],
      "never": ["secrets-and-env-files", "hand-edit-lockfiles-or-generated", "weaken-spec-tests-without-triage", "commit-or-force-push-main"],
      "protectedPaths": ["src/generated/**"]
    },
    "writingStyle": { "plainEnglish": true, "noEmDashes": false }
  },
  "providers": {
    "source": { "id": "github", "customName": null, "notes": null },
    "issues": { "id": "github-issues", "projectHint": null, "includeCliFallback": false, "customName": null, "notes": null },
    "ci": { "id": "github-actions", "customName": null, "notes": null },
    "specs": { "id": "in-repo", "specsDir": "docs/superpowers/specs", "plansDir": "docs/superpowers/plans", "customName": null, "notes": null }
  },
  "skills": {
    "packs": [
      { "source": "obra/superpowers", "url": "https://github.com/obra/superpowers.git", "kind": "spine", "installedDirs": [], "commitSha": null, "installedAt": null }
    ],
    "spinePrecedence": null
  }
}
```

When 2 or more `kind: "spine"` packs are in `skills.packs`, `skills.spinePrecedence` is required and must assign every stage to one selected spine `source` (and any pack may optionally set `selectedSkills` to cherry-pick a non-empty subset of skill directory slugs):

```json
"packs": [
  { "source": "obra/superpowers", "url": "https://github.com/obra/superpowers.git", "kind": "spine", "installedDirs": [], "commitSha": null, "installedAt": null },
  { "source": "mattpocock/skills", "url": "https://github.com/mattpocock/skills.git", "kind": "spine", "selectedSkills": ["grill-me"], "installedDirs": [], "commitSha": null, "installedAt": null }
],
"spinePrecedence": {
  "discoverySpec": "mattpocock/skills",
  "taskBreakdown": "obra/superpowers",
  "implementation": "obra/superpowers",
  "codeReview": "obra/superpowers"
}
```

## Anti-Rationalization Table

| Excuse | Reality |
|---|---|
| "I will just edit `AGENTS.md` directly instead of running `cli.mjs apply`." | Hand-edits break determinism, drift from `.agents/reporig.json`, and risk clobbering human notes. Always write a scratch `<draft-json>` outside `<repo>/.agents/reporig.json` and run `node <skill-dir>/scripts/cli.mjs apply --cwd <repo> --config <draft-json>`. |
| "I will build custom `.harness/` manifests, hook scripts, or `BEGIN MANAGED` markers." | `reporig` standardizes on `.agents/reporig.json`, `.agents/references/*`, `.agents/skills/*` (linked at `.claude/skills`), `CLAUDE.md`, and `<!-- reporig:start -->` ... `<!-- reporig:end -->`. Never invent bespoke scaffolding. |
| "I will skip asking about `prGate` because the preset already has a default." | Teams using the same preset differ sharply on `pr-with-test-plan` vs `local-test-before-pr`. Always ask the PR gate question in interactive Setup Mode. |
| "I will write a stub `SKILL.md` by hand instead of vendoring the upstream pack." | Hand-written stubs miss real skill logic and break `check-updates` SHA tracking. Always let `cli.mjs apply` clone and vendor packs (plus `.agents/skills/reporig/`). |
| "Linear MCP URL in `.mcp.json` is enough for remote agents." | Remote agent sessions often lack interactive MCP OAuth. When `linear` is chosen in Stage 3, ask the `includeCliFallback` yes/no question so `cli.mjs apply` generates `.agents/references/linear-cli-shim.md` and `linear-cli.mjs` when needed. |
| "I can edit `<repo>/.agents/reporig.json` directly before running `cli.mjs apply`." | Overwriting `.agents/reporig.json` in place erases `previousPacks` before `apply` can prune deselected `installedDirs` and mutates repo state before `--dry-run`. Always write `<draft-json>` to a scratch file outside `<repo>/.agents/reporig.json`. |
| "I can skip `--dry-run` or skip `check-updates` when the user says no workflow edits." | `--dry-run` catches unfenced `AGENTS.md` overlaps, budget warnings, and ESLint ignore issues before mutation; `check-updates` is mandatory on every Update Mode run. |
| "I will rewrite preset descriptions around one user's global rules or scan `$HOME` silently." | Presets stay neutral across developers; ask for explicit opt-in before reading local files outside `<repo>`, and present personal matches as recommendations rather than baked-in defaults. |
| "This brownfield repo already has `AGENTS.md`, `CLAUDE.md`, and `.agents/skills/*`, so I will hand-edit `AGENTS.md` or write `.agents/references/*.md` directly before `apply`." | Manual edits bypass `--dry-run` previews, pointer checks, line budgets, case normalization, and failure rollback. Write reconciled prose to scratch files outside `<repo>` and pass `--non-managed-header`, `--write-reference`, `--write-scoped-agents`, `--replace-claude-md`, `--adopt-skills`, `--migrate-claude-skills`, `--prune-skills`, and `--remove-legacy-files` to `cli.mjs apply`. |
| "I will hand-edit `~/.config/reporig/profiles.json` or offer to save a profile without checking `profiles match`." | Hand-diffing profiles leaks repo-specific fields and nags users when an identical profile already exists. Always use `node <skill-dir>/scripts/cli.mjs profiles list|draft|match|save|delete` and only offer to save when `matched` is `false`. |
| "I will skip running `check-upgrades` on Update Mode." | Skipping `check-upgrades` leaves repositories on obsolete settings, misses new workflow capabilities, and fails to record evaluated advisories. Always run `node <skill-dir>/scripts/cli.mjs check-upgrades --cwd <repo>`. |
| "I will run `check-upgrades` before refreshing outdated self-vendored `reporig`." | Running `check-upgrades` using stale local rules misses newly added upstream advisories. Always check updates and refresh `timothyjordan/reporig` first when outdated so `<skill-dir>` runs the latest upgrade rules. |

## Red Flags: Stop and Run `cli.mjs`

- About to write or edit `AGENTS.md` or `CLAUDE.md` directly inside the managed block instead of running `node <skill-dir>/scripts/cli.mjs apply`
- About to hand-edit `<repo>/AGENTS.md` directly or run `rm -rf` on `.agents/skills/*` or `.claude/skills/*` instead of passing scratch `--non-managed-header <header-md>`, `--adopt-skills`, `--migrate-claude-skills`, `--prune-skills`, or `--remove-legacy-files` to `node <skill-dir>/scripts/cli.mjs apply`
- About to overwrite `<repo>/.agents/reporig.json` in place instead of passing a scratch `--config <draft-json>` outside `<repo>/.agents/reporig.json`
- About to create `.harness/`, `.claude/rules/`, custom update scripts, or custom fence comments (only the managed `.claude/skills` link is created under `.claude/`)
- About to write a synthetic `SKILL.md` inside `.agents/skills/` instead of vendoring via `skills.packs`
- About to edit `~/.config/reporig/profiles.json` directly or prompt to save a duplicate profile without running `node <skill-dir>/scripts/cli.mjs profiles match`
- Skipping `inspect`, `validate`, `apply --dry-run`, the interactive `prGate` question, or Update Mode `check-updates` or `check-upgrades`
