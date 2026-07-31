import { describe, it, expect } from 'vitest';
import { planLink } from '../../src/skills/plan.js';

// Minimal SkillTarget factory. linkTo is the absolute canonical dir the
// symlink should point at.
type SkillTarget = {
  kind: 'copy' | 'canonical' | 'link';
  agents: string[];
  label: string;
  managedPath: string;
  linkTo?: string;
};

const LINK_TO = '/tmp/x/.agents/skills/cloudtracer';

function makeTarget(overrides: Partial<SkillTarget> = {}): SkillTarget {
  return {
    kind: 'link',
    agents: ['cline'],
    label: 'Cline',
    managedPath: '/tmp/x/.cline/skills/cloudtracer',
    linkTo: LINK_TO,
    ...overrides,
  };
}

describe('planLink (adversarial)', () => {
  it("action 'create' when existing.kind is 'absent'", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '1.2.3',
      existing: { kind: 'absent' },
      force: false,
    } as any);
    expect(plan.action).toBe('create');
    expect(plan.isSymlink).toBe(false);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('1.2.3');
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'unchanged' when symlink linkTarget equals linkTo", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '9.9.9',
      existing: { kind: 'symlink', linkTarget: LINK_TO },
      force: false,
    } as any);
    expect(plan.action).toBe('unchanged');
    expect(plan.isSymlink).toBe(true);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('9.9.9');
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'unchanged' when symlink linkTarget is an equivalent spelling of linkTo (trailing /./)", () => {
    // '/tmp/x/.agents/skills/./cloudtracer' resolves to the same path as
    // '/tmp/x/.agents/skills/cloudtracer'. Spec: comparison is by resolved path.
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: null,
      existing: {
        kind: 'symlink',
        linkTarget: '/tmp/x/.agents/skills/./cloudtracer',
      },
      force: false,
    } as any);
    expect(plan.action).toBe('unchanged');
    expect(plan.isSymlink).toBe(true);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBeNull();
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'conflict' when symlink points elsewhere and force is false", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '2.0.0',
      existing: {
        kind: 'symlink',
        linkTarget: '/tmp/x/.agents/skills/somewhere-else',
      },
      force: false,
    } as any);
    expect(plan.action).toBe('conflict');
    expect(plan.isSymlink).toBe(true);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('2.0.0');
    expect(typeof plan.conflictReason).toBe('string');
    expect(plan.conflictReason!.length).toBeGreaterThan(0);
  });

  it("action 'update' when symlink points elsewhere and force is true", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '2.0.0',
      existing: {
        kind: 'symlink',
        linkTarget: '/tmp/x/.agents/skills/somewhere-else',
      },
      force: true,
    } as any);
    expect(plan.action).toBe('update');
    expect(plan.isSymlink).toBe(true);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('2.0.0');
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'conflict' when symlink linkTarget is null (points nowhere) and force is false", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '3.1.4',
      existing: { kind: 'symlink', linkTarget: null },
      force: false,
    } as any);
    expect(plan.action).toBe('conflict');
    expect(plan.isSymlink).toBe(true);
    expect(typeof plan.conflictReason).toBe('string');
    expect(plan.conflictReason!.length).toBeGreaterThan(0);
  });

  it("action 'update' when symlink linkTarget is null and force is true", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '3.1.4',
      existing: { kind: 'symlink', linkTarget: null },
      force: true,
    } as any);
    expect(plan.action).toBe('update');
    expect(plan.isSymlink).toBe(true);
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'conflict' when symlink linkTarget is '' (points nowhere) and force is false", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '3.1.4',
      existing: { kind: 'symlink', linkTarget: '' },
      force: false,
    } as any);
    expect(plan.action).toBe('conflict');
    expect(plan.isSymlink).toBe(true);
    expect(typeof plan.conflictReason).toBe('string');
    expect(plan.conflictReason!.length).toBeGreaterThan(0);
  });

  it("action 'update' when symlink linkTarget is '' and force is true", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '3.1.4',
      existing: { kind: 'symlink', linkTarget: '' },
      force: true,
    } as any);
    expect(plan.action).toBe('update');
    expect(plan.isSymlink).toBe(true);
    expect(plan.conflictReason).toBeUndefined();
  });

  it("action 'conflict' when existing.kind is 'other' and force is false", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '5.5.5',
      existing: { kind: 'other' },
      force: false,
    } as any);
    expect(plan.action).toBe('conflict');
    expect(plan.isSymlink).toBe(false);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('5.5.5');
    expect(typeof plan.conflictReason).toBe('string');
    expect(plan.conflictReason!.length).toBeGreaterThan(0);
  });

  it("action 'update' when existing.kind is 'other' and force is true", () => {
    const plan = planLink({
      target: makeTarget() as any,
      fetchedVersion: '5.5.5',
      existing: { kind: 'other' },
      force: true,
    } as any);
    expect(plan.action).toBe('update');
    expect(plan.isSymlink).toBe(false);
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('5.5.5');
    expect(plan.conflictReason).toBeUndefined();
  });

  it('newVersion echoes fetchedVersion including null; oldVersion always null', () => {
    const planNull = planLink({
      target: makeTarget() as any,
      fetchedVersion: null,
      existing: { kind: 'absent' },
      force: false,
    } as any);
    expect(planNull.newVersion).toBeNull();
    expect(planNull.oldVersion).toBeNull();

    const planStr = planLink({
      target: makeTarget() as any,
      fetchedVersion: '0.0.1',
      existing: { kind: 'absent' },
      force: false,
    } as any);
    expect(planStr.newVersion).toBe('0.0.1');
    expect(planStr.oldVersion).toBeNull();
  });

  it('isSymlink is true only for existing.kind === symlink', () => {
    const absent = planLink({
      target: makeTarget() as any,
      fetchedVersion: 'v',
      existing: { kind: 'absent' },
      force: false,
    } as any);
    expect(absent.isSymlink).toBe(false);

    const other = planLink({
      target: makeTarget() as any,
      fetchedVersion: 'v',
      existing: { kind: 'other' },
      force: true,
    } as any);
    expect(other.isSymlink).toBe(false);

    const sym = planLink({
      target: makeTarget() as any,
      fetchedVersion: 'v',
      existing: { kind: 'symlink', linkTarget: LINK_TO },
      force: false,
    } as any);
    expect(sym.isSymlink).toBe(true);
  });

  it('conflictReason is present exactly when action is conflict', () => {
    const conflict = planLink({
      target: makeTarget() as any,
      fetchedVersion: 'v',
      existing: { kind: 'other' },
      force: false,
    } as any);
    expect(conflict.action).toBe('conflict');
    expect(typeof conflict.conflictReason).toBe('string');
    expect((conflict.conflictReason ?? '').length).toBeGreaterThan(0);

    const nonConflicts = [
      planLink({
        target: makeTarget() as any,
        fetchedVersion: 'v',
        existing: { kind: 'absent' },
        force: false,
      } as any),
      planLink({
        target: makeTarget() as any,
        fetchedVersion: 'v',
        existing: { kind: 'symlink', linkTarget: LINK_TO },
        force: false,
      } as any),
      planLink({
        target: makeTarget() as any,
        fetchedVersion: 'v',
        existing: { kind: 'symlink', linkTarget: '/other' },
        force: true,
      } as any),
    ];
    for (const plan of nonConflicts) {
      expect(plan.action).not.toBe('conflict');
      expect(plan.conflictReason).toBeUndefined();
    }
  });

  it('never mutates any argument', () => {
    const target = makeTarget();
    const existing = { kind: 'symlink' as const, linkTarget: '/other/place' };
    const input = {
      target,
      fetchedVersion: '7.7.7',
      existing,
      force: false,
    };
    const targetSnap = JSON.stringify(target);
    const existingSnap = JSON.stringify(existing);
    const inputSnap = JSON.stringify(input);

    planLink(input as any);

    expect(JSON.stringify(target)).toBe(targetSnap);
    expect(JSON.stringify(existing)).toBe(existingSnap);
    expect(JSON.stringify(input)).toBe(inputSnap);
  });

  it('does not throw for well-formed inputs', () => {
    expect(() =>
      planLink({
        target: makeTarget() as any,
        fetchedVersion: null,
        existing: { kind: 'symlink', linkTarget: null },
        force: false,
      } as any),
    ).not.toThrow();
  });
});
