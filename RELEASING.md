# Releasing CloudTracer

This repo ships two things to two different places: the `cloudtracer` npm
package (CLI plus library) and the Chrome extension. They version
independently. This file covers how each one is released, what is automated,
and what a human still has to do.

## Quick reference

| Surface | Trigger | Versioned by | Distribution | Manual step |
|---|---|---|---|---|
| `cloudtracer` (CLI + library) | merge the release-please PR | Conventional Commits touching anything outside `extension/` | npm, with provenance via OIDC | optional: publish the draft GitHub Release |
| Chrome extension | merge the release-please PR | Conventional Commits touching `extension/` | `.zip` on the `extension-v<version>` GitHub Release | upload the `.zip` to the Chrome Web Store |

The one action that ships a release is **merging the "chore: release main" PR**
that the [release-please](https://github.com/googleapis/release-please) bot
keeps open on `main`. Nothing publishes until you merge it.

## How versions are decided

[Conventional Commits](https://www.conventionalcommits.org/) drive the bumps.
`fix:` is a patch, `feat:` is a minor, and `chore:` / `docs:` / `ci:` / `test:`
bump nothing. Both packages are pre-1.0, so `bump-minor-pre-major` keeps
breaking changes at a minor rather than jumping to 2.0.

Which package a commit bumps is decided by **the paths it touched**:

- A commit touching `extension/` bumps the extension.
- A commit touching anything else (`src/`, `test/`, `docs/`, the root config)
  bumps `cloudtracer`.
- A commit touching both bumps both.

That path mapping is the whole mechanism behind independent versioning, so a
change to the popup will not force an npm release, and a scanner fix will not
force an extension release.

## A. The npm package

**Trigger:** merge the bot's PR. Do not run `npm publish` by hand.

**What merging does:**

1. release-please re-runs on the merge commit, tags `cloudtracer-v<version>`,
   and creates a **draft** GitHub Release.
2. The `publish-npm` job in `.github/workflows/release.yml` installs, re-runs
   the full gate (lint, typecheck, build, build:ext, test), and runs
   `npm publish --provenance --access public`.

The gate runs again here even though CI already passed on the release PR. An
npm publish cannot be taken back, so the extra 30 seconds is worth it.

**Auth:** npm Trusted Publishing over OIDC. There is no `NPM_TOKEN` secret.

> **One-time human setup, not yet done.** On npmjs.com, open the `cloudtracer`
> package settings and add a Trusted Publisher pointing at
> `timothyjordan/cloudtracer` with workflow file `release.yml`. Until that
> exists, the publish step fails with a 404 that does not obviously mean
> "unauthenticated". Nobody can do this step from CI.

The workflow upgrades npm before publishing because Node 20 ships npm 10, and
Trusted Publishing needs 11.5.1 or newer. Older npm signs provenance but does
not use the OIDC token as actual auth.

## B. The Chrome extension

**Trigger:** merge the bot's PR, same as above.

**What merging does:**

1. release-please bumps `extension/package.json` and, through `extra-files`,
   `extension/manifest.json` so the manifest version the browser sees always
   matches the tag.
2. It tags `extension-v<version>` and creates a GitHub Release. This one is
   deliberately **not** a draft, because the next step uploads an asset to it.
3. The `publish-extension` job builds, tests, packages the zip, and attaches
   `cloudtracer-extension-<version>.zip` to that release.

**The remaining human step:** download the zip from the release and upload it
to the Chrome Web Store developer dashboard. The extension is not auto-pushed
to the store. Store review gates every update anyway, so an automated upload
would not make it ship faster.

To build the same zip locally:

```sh
npm run package:ext
```

That writes `cloudtracer-extension-<version>.zip` at the repo root (gitignored).
It excludes sourcemaps, which matters more than it sounds: `popup.js.map` is
over 1MB, roughly six times the size of the entire rest of the extension.

## Escape hatch: republish one package

If a publish fails for an infrastructure reason (npm outage, a missing Trusted
Publisher) after release-please has already tagged, do not force another
release commit. Run the `Release` workflow manually from the Actions tab and
pass the package path: `.` for the CLI, `extension` for the extension. That
skips release-please and runs only that publish job.

Use this to recover from a broken run, never for a routine release.

## First release from a standing start

The repo is currently at `cloudtracer@0.1.0` on npm and extension `0.1.0`, with
both recorded in `.release-please-manifest.json`. release-please will not open
a PR until at least one `feat:` or `fix:` commit lands on `main` after this
setup. The first such commit produces the first bot PR.
