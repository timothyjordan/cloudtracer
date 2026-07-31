import { describe, expect, it } from 'vitest';
import { parseSkillName, parseSkillVersion } from '../../src/skills/frontmatter.js';

const SAMPLE = `---
name: cloudtracer
description: audit a site
metadata:
  version: "0.2.0"
  homepage: https://cloudtracer.dev
---

# cloudtracer
body
`;

describe('parseSkillVersion', () => {
  it('reads the quoted metadata.version', () => {
    expect(parseSkillVersion(SAMPLE)).toBe('0.2.0');
  });

  it('reads an unquoted version', () => {
    const c = `---\nname: cloudtracer\nmetadata:\n  version: 1.3.4\n---\nbody`;
    expect(parseSkillVersion(c)).toBe('1.3.4');
  });

  it('tolerates CRLF line endings', () => {
    const c = SAMPLE.replace(/\n/g, '\r\n');
    expect(parseSkillVersion(c)).toBe('0.2.0');
  });

  it('returns null when there is no frontmatter', () => {
    expect(parseSkillVersion('# just markdown\nno fences')).toBeNull();
  });

  it('returns null when metadata has no version', () => {
    const c = `---\nname: cloudtracer\nmetadata:\n  homepage: https://cloudtracer.dev\n---\nbody`;
    expect(parseSkillVersion(c)).toBeNull();
  });

  it('ignores a top-level version-looking key outside metadata', () => {
    const c = `---\nname: cloudtracer\nother: version: nope\n---\nbody`;
    expect(parseSkillVersion(c)).toBeNull();
  });
});

describe('parseSkillName', () => {
  it('reads the top-level name', () => {
    expect(parseSkillName(SAMPLE)).toBe('cloudtracer');
  });

  it('strips quotes', () => {
    const c = `---\nname: "my-skill"\n---\nbody`;
    expect(parseSkillName(c)).toBe('my-skill');
  });

  it('returns null without frontmatter', () => {
    expect(parseSkillName('no frontmatter here')).toBeNull();
  });
});
