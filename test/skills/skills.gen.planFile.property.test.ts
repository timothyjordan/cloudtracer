import { describe, it, expect } from 'vitest';
import { planFile } from '../../src/skills/plan.js';

// ---------------------------------------------------------------------------
// Test-local type mirror (from the TYPE CONTRACT in the spec).
// ---------------------------------------------------------------------------
type SkillAction = 'create' | 'update' | 'unchanged' | 'conflict';
interface SkillTarget {
  kind: 'copy' | 'canonical' | 'link';
  agents: string[];
  label: string;
  managedPath: string;
  linkTo?: string;
}
interface FilePlanInput {
  target: SkillTarget;
  fetched: string;
  current: string | null;
  isSymlink: boolean;
  force: boolean;
}

const ACTIONS: readonly SkillAction[] = ['create', 'update', 'unchanged', 'conflict'];

function skillMd(name: string, version: string, body = 'body text'): string {
  return `---\nname: ${name}\nmetadata:\n  version: "${version}"\n---\n${body}\n`;
}

function makeTarget(): SkillTarget {
  return {
    kind: 'copy',
    agents: ['claude'],
    label: 'Claude Code',
    managedPath: '/tmp/x/cloudtracer/SKILL.md',
  };
}

// Fixed fetched file used across the whole matrix.
const FETCHED_VERSION = '0.2.0';
const FETCHED = skillMd('cloudtracer', FETCHED_VERSION);

// The four kinds of `current` we exercise, deterministically.
type CurrentKind = 'null' | 'identical' | 'differing-ours' | 'differing-foreign';

function buildCurrent(kind: CurrentKind): string | null {
  switch (kind) {
    case 'null':
      return null;
    case 'identical':
      return FETCHED; // byte-identical to fetched
    case 'differing-ours':
      return skillMd('cloudtracer', '0.1.0'); // our skill, older version
    case 'differing-foreign':
      return skillMd('other-skill', '9.9.9'); // foreign name
  }
}

const CURRENT_KINDS: readonly CurrentKind[] = [
  'null',
  'identical',
  'differing-ours',
  'differing-foreign',
];
const BOOLS: readonly boolean[] = [false, true];

interface Row {
  input: FilePlanInput;
  kind: CurrentKind;
  isSymlink: boolean;
  force: boolean;
}

function buildMatrix(): Row[] {
  const rows: Row[] = [];
  for (const kind of CURRENT_KINDS) {
    for (const isSymlink of BOOLS) {
      for (const force of BOOLS) {
        rows.push({
          input: {
            target: makeTarget(),
            fetched: FETCHED,
            current: buildCurrent(kind),
            isSymlink,
            force,
          },
          kind,
          isSymlink,
          force,
        });
      }
    }
  }
  return rows;
}

function label(r: Row): string {
  return `current=${r.kind} isSymlink=${r.isSymlink} force=${r.force}`;
}

// ---------------------------------------------------------------------------
// Property invariants over the full deterministic matrix (4 * 2 * 2 = 16 rows).
// ---------------------------------------------------------------------------

describe('planFile — property invariants over the input matrix', () => {
  it('never throws for any well-formed matrix row', () => {
    for (const r of buildMatrix()) {
      expect(() => planFile(r.input), label(r)).not.toThrow();
    }
  });

  it('action is always one of the four literals', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      expect(ACTIONS, label(r)).toContain(plan.action);
    }
  });

  it("null current is always 'create'", () => {
    for (const r of buildMatrix().filter((x) => x.kind === 'null')) {
      const plan = planFile(r.input);
      expect(plan.action, label(r)).toBe('create');
    }
  });

  it("byte-identical content is always 'unchanged' (regardless of isSymlink/force)", () => {
    for (const r of buildMatrix().filter((x) => x.kind === 'identical')) {
      const plan = planFile(r.input);
      expect(plan.action, label(r)).toBe('unchanged');
    }
  });

  it('newVersion always equals the fetched file version', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      expect(plan.newVersion, label(r)).toBe(FETCHED_VERSION);
    }
  });

  it('oldVersion is null exactly when current is null', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      if (r.kind === 'null') {
        expect(plan.oldVersion, label(r)).toBeNull();
      }
    }
  });

  it('conflictReason is a non-empty string iff action is conflict', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      const cr = plan.conflictReason;
      const hasNonEmptyReason = typeof cr === 'string' && cr.length > 0;
      expect(hasNonEmptyReason, label(r)).toBe(plan.action === 'conflict');
    }
  });

  it('echoes back the passed target and isSymlink', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      expect(plan.target, label(r)).toBe(r.input.target);
      expect(plan.isSymlink, label(r)).toBe(r.isSymlink);
    }
  });

  it('does not mutate any input field', () => {
    for (const r of buildMatrix()) {
      const { input } = r;
      const target = input.target;
      const snap = {
        fetched: input.fetched,
        current: input.current,
        isSymlink: input.isSymlink,
        force: input.force,
        kind: target.kind,
        agents: [...target.agents],
        lbl: target.label,
        managedPath: target.managedPath,
      };

      planFile(input);

      expect(input.fetched, label(r)).toBe(snap.fetched);
      expect(input.current, label(r)).toBe(snap.current);
      expect(input.isSymlink, label(r)).toBe(snap.isSymlink);
      expect(input.force, label(r)).toBe(snap.force);
      expect(target.kind, label(r)).toBe(snap.kind);
      expect(target.agents, label(r)).toEqual(snap.agents);
      expect(target.label, label(r)).toBe(snap.lbl);
      expect(target.managedPath, label(r)).toBe(snap.managedPath);
    }
  });

  // Derived compound invariant straight from the spec's decision rules.
  it('action matches the spec decision table for differing content', () => {
    for (const r of buildMatrix()) {
      const plan = planFile(r.input);
      if (r.kind === 'null') {
        expect(plan.action, label(r)).toBe('create');
      } else if (r.kind === 'identical') {
        expect(plan.action, label(r)).toBe('unchanged');
      } else {
        // Differing content (ours or foreign).
        if (r.force) {
          // force:true + differing -> update, overriding any conflict.
          expect(plan.action, label(r)).toBe('update');
        } else if (r.isSymlink) {
          // symlink + differing + no force -> conflict.
          expect(plan.action, label(r)).toBe('conflict');
        } else if (r.kind === 'differing-ours') {
          // our skill, not symlink, differing -> update.
          expect(plan.action, label(r)).toBe('update');
        } else {
          // foreign, not symlink, differing, no force -> conflict.
          expect(plan.action, label(r)).toBe('conflict');
        }
      }
    }
  });
});
