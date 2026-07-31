# parseSkillName

> Read the top-level `name:` field from a SKILL.md YAML frontmatter block.

The installer uses this to tell *our* cloudtracer skill apart from a foreign file
that happens to live at the same path. A SKILL.md begins with a YAML frontmatter
block delimited by `---` fences (agentskills.io convention). The `name` is a
top-level key inside that block.

## Should

- Return the value of the top-level `name:` key from the frontmatter block, as a
  string, for a well-formed SKILL.md.
- Strip a single pair of surrounding matching quotes (`"..."` or `'...'`) from the
  value, returning the inner text.
- Return `null` when the content has no frontmatter block at all (no opening/closing
  `---` fences).
- Trim surrounding horizontal whitespace around the value.
- Never throw for any string input, including empty string.

## Acceptance criteria

- Given frontmatter containing `name: cloudtracer`, returns `"cloudtracer"`.
- Given `name: "cloudtracer"`, returns `"cloudtracer"` (quotes stripped).
- Given a string with no `---` fences, returns `null`.

## Notes
- Result type is `string | null`.
- Input is arbitrary file text; the function reads, it never mutates.
