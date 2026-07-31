import { describe, it, expect } from 'vitest';
import { planLink } from '../../src/skills/plan.js';

// Deterministic, hand-rolled property testing. No fast-check, no Math.random,
// no Date. We enumerate the full cross product of the meaningful dimensions.

const LINK_TO = '/tmp/x/.agents/skills/cloudtracer';

function makeTarget() {
  return {
    kind: 'link' as const,
    agents: ['cline'],
    label: 'Cline',
    managedPath: '/tmp/x/.cline/skills/cloudtracer',
    linkTo: LINK_TO,
  };
}

type ExistingCase = {
  name: string;
  existing: { kind: 'absent' | 'symlink' | 'other'; linkTarget?: string | null };
};

const EXISTING_CASES: ExistingCase[] = [
  { name: 'absent', existing: { kind: 'absent' } },
  {
    name: 'symlink-correct',
    existing: { kind: 'symlink', linkTarget: LINK_TO },
  },
  {
    name: 'symlink-elsewhere',
    existing: { kind: 'symlink', linkTarget: '/tmp/x/.agents/skills/other' },
  },
  { name: 'other', existing: { kind: 'other' } },
];

const FORCES = [true, false];
const VERSIONS: (string | null)[] = ['1.4.0', null];
const ACTIONS = ['create', 'update', 'unchanged', 'conflict'];

describe('planLink (property)', () => {
  it('holds all spec invariants across the full input cross product', () => {
    for (const ec of EXISTING_CASES) {
      for (const force of FORCES) {
        for (const fetchedVersion of VERSIONS) {
          const target = makeTarget();
          const existing = { ...ec.existing };
          const input = { target, fetchedVersion, existing, force };

          const targetSnap = JSON.stringify(target);
          const existingSnap = JSON.stringify(existing);
          const inputSnap = JSON.stringify(input);

          let plan: ReturnType<typeof planLink>;
          expect(() => {
            plan = planLink(input as any);
          }).not.toThrow();
          plan = planLink(input as any);

          const ctx = `${ec.name}/force=${force}/version=${String(
            fetchedVersion,
          )}`;

          // action is always one of the four literals
          expect(ACTIONS, ctx).toContain(plan.action);

          // oldVersion always null
          expect(plan.oldVersion, ctx).toBeNull();

          // newVersion always echoes fetchedVersion
          expect(plan.newVersion, ctx).toBe(fetchedVersion);

          // isSymlink === (kind === 'symlink')
          expect(plan.isSymlink, ctx).toBe(ec.existing.kind === 'symlink');

          // conflictReason present iff action === 'conflict'
          if (plan.action === 'conflict') {
            expect(typeof plan.conflictReason, ctx).toBe('string');
            expect((plan.conflictReason ?? '').length, ctx).toBeGreaterThan(0);
          } else {
            expect(plan.conflictReason, ctx).toBeUndefined();
          }

          // absent -> create
          if (ec.name === 'absent') {
            expect(plan.action, ctx).toBe('create');
          }

          // correct-symlink -> unchanged (regardless of force)
          if (ec.name === 'symlink-correct') {
            expect(plan.action, ctx).toBe('unchanged');
          }

          // inputs never mutated
          expect(JSON.stringify(target), ctx).toBe(targetSnap);
          expect(JSON.stringify(existing), ctx).toBe(existingSnap);
          expect(JSON.stringify(input), ctx).toBe(inputSnap);
        }
      }
    }
  });

  it('conflict vs update depends on force for elsewhere-symlink and other', () => {
    for (const ec of EXISTING_CASES) {
      if (ec.name !== 'symlink-elsewhere' && ec.name !== 'other') continue;
      for (const fetchedVersion of VERSIONS) {
        const conflictPlan = planLink({
          target: makeTarget(),
          fetchedVersion,
          existing: { ...ec.existing },
          force: false,
        } as any);
        expect(conflictPlan.action).toBe('conflict');

        const updatePlan = planLink({
          target: makeTarget(),
          fetchedVersion,
          existing: { ...ec.existing },
          force: true,
        } as any);
        expect(updatePlan.action).toBe('update');
      }
    }
  });
});
