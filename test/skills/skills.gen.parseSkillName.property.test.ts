import { describe, it, expect } from 'vitest';
import { parseSkillName } from '../../src/skills/frontmatter.js';

/**
 * Property-based tests for parseSkillName, authored from the SPEC only.
 * fast-check is NOT available, so input generation is hand-rolled from fixed
 * arrays and small loops. No Math.random, no Date, fully deterministic.
 *
 * Invariants under test (all from the spec):
 *  1. For a name value placed as `name: <v>` inside a proper `---`-fenced
 *     block, the result equals `<v>` with one matching quote-pair stripped
 *     and surrounding horizontal whitespace trimmed.
 *  2. For any input containing no `---` fence, the result is null.
 *  3. The function never throws for any string input.
 */

// Simple, safe name values (no surrounding quotes, no leading/trailing
// horizontal whitespace, single-line). These are the canonical `<v>`.
const NAMES = [
  'cloudtracer',
  'my-skill',
  'skill_123',
  'AnotherName',
  'a',
  'name.with.dots',
  'skill-with-many-hyphens-here',
];

// Quoting styles applied around the canonical value.
type Quoter = { wrap: (v: string) => string };
const QUOTERS: Quoter[] = [
  { wrap: (v) => v }, // unquoted
  { wrap: (v) => `"${v}"` }, // double quoted
  { wrap: (v) => `'${v}'` }, // single quoted
];

// Horizontal padding applied between the colon and the value, and trailing.
const PADS = ['', ' ', '   ', '\t', ' \t '];

describe('parseSkillName - property: quote stripping + trimming inside fences', () => {
  for (const name of NAMES) {
    for (let qi = 0; qi < QUOTERS.length; qi++) {
      for (let li = 0; li < PADS.length; li++) {
        for (let ri = 0; ri < PADS.length; ri++) {
          const quoted = QUOTERS[qi].wrap(name);
          const leftPad = PADS[li];
          const rightPad = PADS[ri];
          const content = `---\nname:${leftPad}${quoted}${rightPad}\n---\n`;
          it(`resolves name="${name}" q=${qi} lp=${JSON.stringify(
            leftPad,
          )} rp=${JSON.stringify(rightPad)}`, () => {
            // Expected: trim horizontal whitespace, then strip one matching
            // quote pair, yielding the canonical name.
            expect(parseSkillName(content)).toBe(name);
          });
        }
      }
    }
  }
});

describe('parseSkillName - property: no `---` fence yields null', () => {
  // Build many fence-free inputs deterministically. None of these contain the
  // `---` fence sequence, so per spec the result must be null.
  const bodies = [
    '',
    'just some text',
    'name: cloudtracer', // looks like a key, but no fences at all
    'name: cloudtracer\ndescription: x',
    '# Heading\n\nparagraph with name: value in it',
    'line1\nline2\nline3',
    'key: value\nother: thing',
  ];
  for (const body of bodies) {
    // Sanity: ensure our generated body truly has no `---` fence.
    if (body.includes('---')) continue;
    it(`returns null for fence-free input ${JSON.stringify(body)}`, () => {
      expect(parseSkillName(body)).toBeNull();
    });
  }
});

describe('parseSkillName - property: never throws for arbitrary strings', () => {
  // Deterministically assembled assortment of odd inputs.
  const fragments = ['', '---', '\n', 'name:', 'name: x', '﻿', '\r\n', '"', "'"];
  const inputs: string[] = [];
  for (let i = 0; i < fragments.length; i++) {
    for (let j = 0; j < fragments.length; j++) {
      inputs.push(fragments[i] + fragments[j]);
      inputs.push(fragments[i] + fragments[j] + fragments[i]);
    }
  }
  for (const input of inputs) {
    it(`does not throw for ${JSON.stringify(input)}`, () => {
      expect(() => parseSkillName(input)).not.toThrow();
    });
  }
});
