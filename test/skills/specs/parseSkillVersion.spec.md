# parseSkillVersion

> Read the nested `metadata.version` field from a SKILL.md YAML frontmatter block.

On an update the installer surfaces "old version -> new version". The version lives
nested under a top-level `metadata:` mapping in the frontmatter, e.g.

```
---
name: cloudtracer
metadata:
  version: "0.1.0"
---
```

## Should

- Return the value of `version:` that is nested (indented) under the top-level
  `metadata:` key, as a string.
- Strip a single pair of surrounding matching quotes from the value.
- Return `null` when there is no frontmatter block.
- Return `null` when the frontmatter has a `metadata:` block but no `version:` inside it.
- Return `null` for a `version:` key that is NOT inside the `metadata:` block (for
  example a top-level `version:` sibling of `metadata:`). Only the nested metadata
  version counts.
- Tolerate `\r\n` (CRLF) line endings and an optional leading BOM.
- Never throw for any string input.

## Acceptance criteria

- Given a frontmatter with `metadata:` then an indented `version: "0.1.0"`, returns `"0.1.0"`.
- Given an unquoted indented `version: 0.1.0`, returns `"0.1.0"`.
- Given a top-level `version: 9.9.9` that is not under `metadata:`, returns `null`.
- Given `metadata:` with keys but no `version:`, returns `null`.

## Notes
- Result type is `string | null`.
- The function reads, it never mutates its input.
