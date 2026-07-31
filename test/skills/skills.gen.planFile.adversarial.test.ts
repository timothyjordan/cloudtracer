import { describe, it, expect } from 'vitest';
import { planFile } from '../../src/skills/plan.js';

// ---------------------------------------------------------------------------
// Test-local type mirror (from the TYPE CONTRACT in the spec). We do NOT import
// these from the implementation; they exist only to keep the test typed.
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
interface TargetPlan {
  target: SkillTarget;
  action: SkillAction;
  oldVersion: string | null;
  newVersion: string | null;
  isSymlink: boolean;
  conflictReason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Construct a minimal SKILL.md string with a given top-level name and nested
 *  metadata.version, plus an optional body. */
function skillMd(name: string, version: string, body = 'body text'): string {
  return `---\nname: ${name}\nmetadata:\n  version: "${version}"\n---\n${body}\n`;
}

function makeTarget(overrides: Partial<SkillTarget> = {}): SkillTarget {
  return {
    kind: 'copy',
    agents: ['claude'],
    label: 'Claude Code',
    managedPath: '/tmp/x/cloudtracer/SKILL.md',
    ...overrides,
  };
}

function makeInput(overrides: Partial<FilePlanInput> = {}): FilePlanInput {
  return {
    target: makeTarget(),
    fetched: skillMd('cloudtracer', '0.2.0'),
    current: null,
    isSymlink: false,
    force: false,
    ...overrides,
  };
}

/** Deep-freeze an object graph so any mutation attempt throws in strict mode. */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Acceptance cases (each maps directly to a spec bullet)
// ---------------------------------------------------------------------------

describe('planFile — acceptance cases', () => {
  it("current === null -> 'create'", () => {
    const plan: TargetPlan = planFile(
      makeInput({ current: null, fetched: skillMd('cloudtracer', '1.2.3') }),
    );
    expect(plan.action).toBe('create');
  });

  it("current === fetched (byte-identical) -> 'unchanged', even force:false", () => {
    const body = skillMd('cloudtracer', '1.0.0');
    const plan = planFile(makeInput({ current: body, fetched: body, force: false }));
    expect(plan.action).toBe('unchanged');
  });

  it("differing content, current name cloudtracer, not symlink -> 'update'", () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: false,
        force: false,
      }),
    );
    expect(plan.action).toBe('update');
  });

  it("differing content, current name something-else, force:false -> 'conflict'", () => {
    const plan = planFile(
      makeInput({
        current: skillMd('other-skill', '9.9.9'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: false,
        force: false,
      }),
    );
    expect(plan.action).toBe('conflict');
  });

  it("isSymlink:true, force:false, differing content -> 'conflict'", () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: true,
        force: false,
      }),
    );
    expect(plan.action).toBe('conflict');
  });

  it("isSymlink:true, force:true, differing content -> 'update'", () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: true,
        force: true,
      }),
    );
    expect(plan.action).toBe('update');
  });
});

// ---------------------------------------------------------------------------
// Tricky / edge cases
// ---------------------------------------------------------------------------

describe('planFile — tricky cases', () => {
  it("byte-identical content on a symlink short-circuits to 'unchanged' (identical wins regardless of isSymlink/force)", () => {
    const body = skillMd('cloudtracer', '3.1.4');
    // Even though it is a symlink and force is false, identical content means
    // there is nothing to write, so the action is 'unchanged'.
    const plan = planFile(
      makeInput({ current: body, fetched: body, isSymlink: true, force: false }),
    );
    expect(plan.action).toBe('unchanged');
  });

  it("byte-identical content is 'unchanged' even under force:true", () => {
    const body = skillMd('cloudtracer', '3.1.4');
    const plan = planFile(makeInput({ current: body, fetched: body, force: true }));
    expect(plan.action).toBe('unchanged');
  });

  it('force:true overrides a foreign-name conflict -> update', () => {
    const plan = planFile(
      makeInput({
        current: skillMd('other-skill', '9.9.9'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: false,
        force: true,
      }),
    );
    expect(plan.action).toBe('update');
  });

  it('differing on-disk file with no parseable name, force:false -> conflict', () => {
    const plan = planFile(
      makeInput({
        current: 'this is not valid frontmatter at all',
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: false,
        force: false,
      }),
    );
    expect(plan.action).toBe('conflict');
  });

  it('newVersion equals parsed metadata.version of fetched (exact string)', () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
      }),
    );
    expect(plan.newVersion).toBe('0.2.0');
  });

  it('oldVersion equals parsed metadata.version of current (exact string)', () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
      }),
    );
    expect(plan.oldVersion).toBe('0.1.0');
  });

  it('oldVersion is null when current is null', () => {
    const plan = planFile(
      makeInput({ current: null, fetched: skillMd('cloudtracer', '7.0.0') }),
    );
    expect(plan.oldVersion).toBeNull();
    expect(plan.newVersion).toBe('7.0.0');
  });

  it('conflictReason is a non-empty string exactly when action is conflict', () => {
    const conflictPlan = planFile(
      makeInput({
        current: skillMd('other-skill', '9.9.9'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: false,
        force: false,
      }),
    );
    expect(conflictPlan.action).toBe('conflict');
    expect(typeof conflictPlan.conflictReason).toBe('string');
    expect((conflictPlan.conflictReason as string).length).toBeGreaterThan(0);
  });

  it('conflictReason is absent (or not a non-empty string) when action is not conflict', () => {
    const updatePlan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
      }),
    );
    expect(updatePlan.action).toBe('update');
    // Spec: conflictReason is non-empty iff action==='conflict'. So for a
    // non-conflict it must NOT be a non-empty string.
    const cr = updatePlan.conflictReason;
    expect(cr === undefined || cr === '').toBe(true);
  });

  it('conflictReason absent for create', () => {
    const plan = planFile(makeInput({ current: null }));
    const cr = plan.conflictReason;
    expect(cr === undefined || cr === '').toBe(true);
  });

  it('conflictReason absent for unchanged', () => {
    const body = skillMd('cloudtracer', '1.0.0');
    const plan = planFile(makeInput({ current: body, fetched: body }));
    const cr = plan.conflictReason;
    expect(cr === undefined || cr === '').toBe(true);
  });

  it('returned plan echoes back the exact target passed in (same reference/value)', () => {
    const target = makeTarget({ label: 'Some Distinct Label', managedPath: '/a/b/SKILL.md' });
    const plan = planFile(makeInput({ target }));
    expect(plan.target).toBe(target);
  });

  it('returned plan echoes back isSymlink (true)', () => {
    const plan = planFile(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
        isSymlink: true,
        force: true,
      }),
    );
    expect(plan.isSymlink).toBe(true);
  });

  it('returned plan echoes back isSymlink (false)', () => {
    const plan = planFile(makeInput({ isSymlink: false }));
    expect(plan.isSymlink).toBe(false);
  });

  it('does not mutate the input argument (deep-frozen input still yields a plan)', () => {
    const input = deepFreeze(
      makeInput({
        current: skillMd('cloudtracer', '0.1.0'),
        fetched: skillMd('cloudtracer', '0.2.0'),
      }),
    );
    // If planFile tried to mutate a frozen input, strict-mode ESM would throw.
    const plan = planFile(input);
    expect(plan.action).toBe('update');
  });

  it('does not mutate input field values (snapshot compare after call)', () => {
    const target = makeTarget();
    const fetched = skillMd('cloudtracer', '0.2.0');
    const current = skillMd('cloudtracer', '0.1.0');
    const input: FilePlanInput = { target, fetched, current, isSymlink: false, force: false };

    const snapshot = {
      fetched: input.fetched,
      current: input.current,
      isSymlink: input.isSymlink,
      force: input.force,
      targetKind: target.kind,
      targetAgents: [...target.agents],
      targetLabel: target.label,
      targetManagedPath: target.managedPath,
    };

    planFile(input);

    expect(input.fetched).toBe(snapshot.fetched);
    expect(input.current).toBe(snapshot.current);
    expect(input.isSymlink).toBe(snapshot.isSymlink);
    expect(input.force).toBe(snapshot.force);
    expect(target.kind).toBe(snapshot.targetKind);
    expect(target.agents).toEqual(snapshot.targetAgents);
    expect(target.label).toBe(snapshot.targetLabel);
    expect(target.managedPath).toBe(snapshot.targetManagedPath);
  });

  it('never throws for well-formed inputs across the core acceptance rows', () => {
    const fetched = skillMd('cloudtracer', '0.2.0');
    const ours = skillMd('cloudtracer', '0.1.0');
    const foreign = skillMd('other-skill', '9.9.9');
    const rows: FilePlanInput[] = [
      makeInput({ current: null, fetched }),
      makeInput({ current: fetched, fetched }),
      makeInput({ current: ours, fetched }),
      makeInput({ current: foreign, fetched, force: false }),
      makeInput({ current: ours, fetched, isSymlink: true, force: false }),
      makeInput({ current: ours, fetched, isSymlink: true, force: true }),
    ];
    for (const row of rows) {
      expect(() => planFile(row)).not.toThrow();
    }
  });
});
