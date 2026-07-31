import { describe, it, expect } from 'vitest';
import { parseSkillName } from '../../src/skills/frontmatter.js';

/**
 * Adversarial tests for parseSkillName, authored from the SPEC only.
 *
 * SPEC recap:
 * - Read the top-level `name:` field from a YAML frontmatter block delimited
 *   by `---` fences.
 * - Return the value as a string for a well-formed SKILL.md.
 * - Strip a single pair of surrounding matching quotes ("..." or '...').
 * - Return null when there is no frontmatter block (no opening/closing `---`).
 * - Trim surrounding horizontal whitespace around the value.
 * - Never throw for any string input, including empty string.
 */

describe('parseSkillName - acceptance criteria', () => {
  it('reads an unquoted top-level name value', () => {
    const content = '---\nname: cloudtracer\n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('strips surrounding double quotes from the value', () => {
    const content = '---\nname: "cloudtracer"\n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('returns null when there are no `---` fences at all', () => {
    const content = 'name: cloudtracer\nsome other text\n';
    expect(parseSkillName(content)).toBeNull();
  });
});

describe('parseSkillName - quote stripping', () => {
  it('strips surrounding single quotes from the value', () => {
    const content = "---\nname: 'cloudtracer'\n---\n";
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('strips exactly one matching pair (double)', () => {
    // Only one pair of surrounding matching quotes should be stripped.
    const content = '---\nname: ""cloudtracer""\n---\n';
    expect(parseSkillName(content)).toBe('"cloudtracer"');
  });

  it('strips exactly one matching pair (single)', () => {
    const content = "---\nname: ''cloudtracer''\n---\n";
    expect(parseSkillName(content)).toBe("'cloudtracer'");
  });
});

describe('parseSkillName - whitespace handling', () => {
  it('trims horizontal whitespace around the value', () => {
    const content = '---\nname:    cloudtracer   \n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('trims whitespace, then strips quotes for a quoted padded value', () => {
    const content = '---\nname:   "cloudtracer"   \n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('trims tabs around the value', () => {
    const content = '---\nname:\tcloudtracer\t\n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });
});

describe('parseSkillName - no frontmatter block', () => {
  it('returns null for empty string without throwing', () => {
    expect(() => parseSkillName('')).not.toThrow();
    expect(parseSkillName('')).toBeNull();
  });

  it('returns null when only body text is present', () => {
    const content = '# My Skill\n\nThis skill has a name: something in prose.\n';
    expect(parseSkillName(content)).toBeNull();
  });

  it('returns null when there is an opening fence but no name inside', () => {
    // No `name:` key present anywhere; spec gives no name to return.
    const content = '---\ndescription: a skill\n---\n';
    expect(parseSkillName(content)).toBeNull();
  });
});

describe('parseSkillName - name only in body, not in frontmatter', () => {
  it('does not treat a body `name:` line as the frontmatter name', () => {
    // Frontmatter block contains only description. The `name:` appears in the
    // body after the closing fence, so it is not a top-level frontmatter key.
    const content =
      '---\ndescription: a skill\n---\n\nSome body text.\nname: not-the-real-name\n';
    expect(parseSkillName(content)).toBeNull();
  });
});

describe('parseSkillName - line endings and BOM', () => {
  it('handles CRLF line endings', () => {
    const content = '---\r\nname: cloudtracer\r\n---\r\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });

  it('handles a leading UTF-8 BOM before the frontmatter', () => {
    const content = '﻿---\nname: cloudtracer\n---\n';
    expect(parseSkillName(content)).toBe('cloudtracer');
  });
});

describe('parseSkillName - never throws', () => {
  const inputs = [
    '',
    '---',
    '---\n',
    '---\n---\n',
    'no fences here',
    '---\nname:\n---\n',
    '﻿',
    '---\r\n---\r\n',
  ];
  for (const input of inputs) {
    it(`does not throw for input ${JSON.stringify(input)}`, () => {
      expect(() => parseSkillName(input)).not.toThrow();
    });
  }
});
