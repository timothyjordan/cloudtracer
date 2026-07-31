# planLink

> Decide what to do with one symlink target (an agent's `cloudtracer` dir that
> should point at the shared canonical dir) on install/update.

Inputs: the `target` (whose `linkTo` is the absolute canonical dir the symlink
should point at), the freshly fetched version string (for reporting), the current
state of the path (`existing.kind` is `absent | symlink | other`, with
`existing.linkTarget` for a symlink), and the `--force` flag.

`SkillAction` is one of `create | update | unchanged | conflict`.

## Should

- Return `action: 'create'` when `existing.kind` is `'absent'`.
- Return `action: 'unchanged'` when `existing.kind` is `'symlink'` and its
  `linkTarget` resolves to the same path as the target's `linkTo` (already correct).
- Return `action: 'conflict'` when `existing.kind` is `'symlink'` but points
  somewhere other than `linkTo`, and `force` is false.
- Return `action: 'update'` when `existing.kind` is `'symlink'` pointing elsewhere
  and `force` is true (relink).
- Return `action: 'conflict'` when `existing.kind` is `'other'` (a real file or
  directory occupies the path) and `force` is false.
- Return `action: 'update'` when `existing.kind` is `'other'` and `force` is true.
- Set `isSymlink` on the returned plan to whether `existing.kind === 'symlink'`.
- Set `newVersion` to the passed `fetchedVersion` and `oldVersion` to `null`.
- Provide a `conflictReason` whenever (and only when) the action is `conflict`.
- Never mutate any argument. Never throw for well-formed inputs.

## Acceptance criteria

- `existing.kind: 'absent'` -> `create`.
- symlink whose `linkTarget` equals `linkTo` -> `unchanged`.
- symlink pointing elsewhere, `force: false` -> `conflict`; `force: true` -> `update`.
- `existing.kind: 'other'`, `force: false` -> `conflict`; `force: true` -> `update`.

## Notes
- Result type is `TargetPlan`.
- Path comparison is by resolved path, so equivalent spellings match.
