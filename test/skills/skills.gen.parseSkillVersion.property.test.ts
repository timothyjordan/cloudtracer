import { describe, it, expect } from 'vitest';
import { parseSkillVersion } from '../../src/skills/frontmatter.js';

// Deterministic, hand-rolled generation (no fast-check, no Math.random, no Date).

const VERSIONS = [
  '0.1.0',
  '1.2.3',
  '10.20.30',
  '2.0.0-beta.1',
  '2024.7',
  '0.0.1',
  'v3',
  '1',
];

const QUOTES: Array<'' | '"' | "'"> = ['', '"', "'"];

const EOLS = ['\n', '\r\n'];
const BOMS = ['', '﻿'];

describe('parseSkillVersion — property: nested metadata version round-trips', () => {
  it('returns the nested value with one matching quote-pair stripped, across quoting/EOL/BOM', () => {
    for (const version of VERSIONS) {
      for (const quote of QUOTES) {
        for (const eol of EOLS) {
          for (const bom of BOMS) {
            const rawValue = `${quote}${version}${quote}`;
            const content =
              `${bom}---${eol}` +
              `name: cloudtracer${eol}` +
              `metadata:${eol}` +
              `  version: ${rawValue}${eol}` +
              `---${eol}`;
            // The oracle: whatever quote we wrapped with, one matching pair is
            // stripped, so we always recover the bare version string.
            expect(parseSkillVersion(content)).toBe(version);
          }
        }
      }
    }
  });
});

describe('parseSkillVersion — property: top-level-only version is null', () => {
  it('returns null when version: is only a top-level sibling of metadata', () => {
    for (const version of VERSIONS) {
      for (const eol of EOLS) {
        // version present only at top level, metadata has no version inside it.
        const content =
          `---${eol}` +
          `name: cloudtracer${eol}` +
          `version: ${version}${eol}` +
          `metadata:${eol}` +
          `  author: someone${eol}` +
          `---${eol}`;
        expect(parseSkillVersion(content)).toBeNull();
      }
    }
  });
});

describe('parseSkillVersion — property: no fence yields null', () => {
  it('returns null for any input lacking a --- frontmatter fence', () => {
    const bodies = [
      '',
      'plain text',
      'metadata:\n  version: 1.0.0',
      '# heading\nversion: 2.0.0\nmetadata:\n  version: 3.0.0',
      'name: x\nmetadata:\n  version: "9.9.9"',
    ];
    for (const body of bodies) {
      expect(parseSkillVersion(body)).toBeNull();
    }
  });
});

describe('parseSkillVersion — property: never throws for arbitrary strings', () => {
  it('returns a string or null and never throws', () => {
    const weird = [
      '',
      '---',
      '---\n',
      '---\n---\n',
      '---\nmetadata:\n---\n',
      '﻿',
      '\r\n\r\n---\r\n',
      '---\nmetadata:\n  version:\n---\n',
      'metadata: version: 1.0.0',
      '::::::',
      '---\nversion: 1\n---',
      'a'.repeat(1000),
      '---\n'.repeat(50),
    ];
    for (const input of weird) {
      let result: string | null = null;
      expect(() => {
        result = parseSkillVersion(input);
      }).not.toThrow();
      expect(result === null || typeof result === 'string').toBe(true);
    }
  });
});
