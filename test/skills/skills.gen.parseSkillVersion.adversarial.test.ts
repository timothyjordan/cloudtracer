import { describe, it, expect } from 'vitest';
import { parseSkillVersion } from '../../src/skills/frontmatter.js';

// Helpers to build frontmatter with explicit, real newlines.
const fm = (body: string) => `---\n${body}\n---\n`;

describe('parseSkillVersion — adversarial', () => {
  it('reads a quoted version nested under metadata (acceptance case)', () => {
    const content = fm(`name: cloudtracer\nmetadata:\n  version: "0.1.0"`);
    expect(parseSkillVersion(content)).toBe('0.1.0');
  });

  it('reads an unquoted version nested under metadata (acceptance case)', () => {
    const content = fm(`name: cloudtracer\nmetadata:\n  version: 0.1.0`);
    expect(parseSkillVersion(content)).toBe('0.1.0');
  });

  it('strips a single pair of matching single quotes', () => {
    const content = fm(`metadata:\n  version: '1.2.3'`);
    expect(parseSkillVersion(content)).toBe('1.2.3');
  });

  it('returns null for a top-level version that is a sibling of metadata (acceptance case)', () => {
    // version: 9.9.9 is NOT indented under metadata; only nested metadata version counts.
    const content = fm(`name: cloudtracer\nversion: 9.9.9\nmetadata:\n  name: inner`);
    expect(parseSkillVersion(content)).toBeNull();
  });

  it('returns null for a top-level version appearing BEFORE metadata', () => {
    const content = fm(`version: 9.9.9\nmetadata:\n  name: inner`);
    expect(parseSkillVersion(content)).toBeNull();
  });

  it('returns null when metadata block has keys but no version (acceptance case)', () => {
    const content = fm(`name: cloudtracer\nmetadata:\n  author: someone\n  license: MIT`);
    expect(parseSkillVersion(content)).toBeNull();
  });

  it('returns null when there is no frontmatter block at all', () => {
    const content = `# Just a heading\n\nSome body text with version: 1.0.0 in it.`;
    expect(parseSkillVersion(content)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSkillVersion('')).toBeNull();
  });

  it('tolerates CRLF line endings', () => {
    const content = `---\r\nname: cloudtracer\r\nmetadata:\r\n  version: "2.5.0"\r\n---\r\n`;
    expect(parseSkillVersion(content)).toBe('2.5.0');
  });

  it('tolerates a leading BOM', () => {
    const content = `﻿` + fm(`metadata:\n  version: "3.0.0"`);
    expect(parseSkillVersion(content)).toBe('3.0.0');
  });

  it('tolerates leading BOM together with CRLF endings', () => {
    const content = `﻿---\r\nmetadata:\r\n  version: 4.1.0\r\n---\r\n`;
    expect(parseSkillVersion(content)).toBe('4.1.0');
  });

  it('returns null when a version: is indented but appears after the metadata block ended', () => {
    // A later non-indented key ends the metadata block; the indented version below
    // it belongs to a different (later) mapping, not metadata.
    const content = fm(`metadata:\n  author: someone\nother:\n  version: 7.7.7`);
    expect(parseSkillVersion(content)).toBeNull();
  });

  it('reads the nested version even when metadata has other keys around it', () => {
    const content = fm(`metadata:\n  author: someone\n  version: "5.5.5"\n  license: MIT`);
    expect(parseSkillVersion(content)).toBe('5.5.5');
  });

  it('does not strip mismatched surrounding quotes', () => {
    // Only a MATCHING pair should be stripped. A leading quote with no matching
    // trailing quote must not be stripped as if it were a pair.
    const content = fm(`metadata:\n  version: "6.0.0`);
    expect(parseSkillVersion(content)).toBe('"6.0.0');
  });

  it('strips only a single pair of matching quotes (double-quoted content preserved)', () => {
    const content = fm(`metadata:\n  version: "'8.0.0'"`);
    expect(parseSkillVersion(content)).toBe("'8.0.0'");
  });
});
