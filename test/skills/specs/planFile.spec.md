# planFile

> Decide what to do with one real SKILL.md file target on install/update.

Given the freshly downloaded skill body (`fetched`), the current on-disk content
(`current`, or `null` when absent), whether the path is a symlink (`isSymlink`),
and the `--force` flag, decide an action. The install is idempotent and must not
clobber files it does not own.

`SkillAction` is one of `create | update | unchanged | conflict`.

## Should

- Return `action: 'create'` when `current` is `null` (nothing on disk yet).
- Return `action: 'unchanged'` when `current` is byte-identical to `fetched`
  (idempotent no-op), regardless of `force`.
- Return `action: 'update'` when a differing file on disk is *our* skill — its
  frontmatter `name` is `cloudtracer` — and it is not a symlink.
- Return `action: 'conflict'` when a differing on-disk file is NOT our skill
  (foreign `name`, or no parseable name) and `force` is false.
- Return `action: 'conflict'` when the target is a symlink and `force` is false,
  even if content differs. (We do not write through a symlink without `--force`.)
- Return `action: 'update'` when `force` is true and the file differs and is not
  byte-identical, overriding a conflict that would otherwise be raised.
- Populate `newVersion` from the parsed version of `fetched`, and `oldVersion` from
  the parsed version of `current` (or `null` when `current` is `null`).
- Echo back the passed `target` and `isSymlink` on the returned plan.
- Provide a `conflictReason` string whenever (and only when) the action is `conflict`.
- Never mutate any argument. Never throw for well-formed inputs.

## Acceptance criteria

- `current === null` -> `create`.
- `current === fetched` -> `unchanged` (even with `force: false`).
- Differing content, current has `name: cloudtracer`, not a symlink -> `update`.
- Differing content, current has `name: something-else`, `force: false` -> `conflict`.
- `isSymlink: true`, `force: false`, differing content -> `conflict`.
- `isSymlink: true`, `force: true` -> `update`.

## Notes
- Result type is `TargetPlan`.
