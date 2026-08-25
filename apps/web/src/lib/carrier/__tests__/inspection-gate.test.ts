/**
 * The trip-start gate, exercised as a pure function.
 *
 * No database is faked here, deliberately — there is nothing to fake, because
 * `evaluateTripStartGate` takes everything as an argument. DEC-14's warning
 * ("a faked DB in a unit test is not evidence about SQL") is what pushed the
 * decision into a file with no I/O in the first place.
 *
 * The window constant is IMPORTED, never restated. A test that hardcodes 24
 * stops testing the constant and starts testing a copy of it.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateTripStartGate,
  inspectionValidFrom,
  isInspectionComplete,
  failedItems,
  type InspectionItemOutcome,
  type InspectionSnapshot,
  type TripStartGateInput,
} from '../inspection-gate';
import { INSPECTION_VALIDITY_HOURS } from '../inspection-constants';

const NOW = new Date('2026-08-25T09:00:00.000Z');

function item(over: Partial<InspectionItemOutcome> = {}): InspectionItemOutcome {
  return {
    stepInstanceId: 'step-1',
    name: 'Front Brakes',
    isCritical: false,
    status: 'COMPLETE',
    note: null,
    photoKeys: [],
    completedAt: NOW,
    ...over,
  };
}

function snapshot(
  items: InspectionItemOutcome[],
  over: Partial<InspectionSnapshot> = {}
): InspectionSnapshot {
  return {
    playbookInstanceId: 'inst-1',
    dispatchId: 'trip-1',
    truckId: 'truck-1',
    completedByUserId: 'user-1',
    items,
    lastAnsweredAt: NOW,
    ...over,
  };
}

function input(over: Partial<TripStartGateInput> = {}): TripStartGateInput {
  return {
    tenantRequiresInspection: true,
    tenantBlocksOnFailure: true,
    tripInspectionRequired: null,
    override: null,
    currentInspection: null,
    priorInspection: null,
    now: NOW,
    ...over,
  };
}

describe('evaluateTripStartGate — is an inspection required?', () => {
  it('allows immediately when the tenant does not require one', () => {
    const v = evaluateTripStartGate(input({ tenantRequiresInspection: false }));
    expect(v).toEqual({ kind: 'ALLOWED', via: 'NOT_REQUIRED' });
  });

  it('lets a per-trip false override a tenant true', () => {
    const v = evaluateTripStartGate(
      input({ tenantRequiresInspection: true, tripInspectionRequired: false })
    );
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('NOT_REQUIRED');
  });

  it('lets a per-trip true override a tenant false', () => {
    const v = evaluateTripStartGate(
      input({ tenantRequiresInspection: false, tripInspectionRequired: true })
    );
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });

  it('treats a null per-trip value as "use the tenant setting", not as false', () => {
    const v = evaluateTripStartGate(
      input({ tenantRequiresInspection: true, tripInspectionRequired: null })
    );
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });

  it('does NOT strand a driver on a stale failure after the setting is turned off', () => {
    // The whole point of checking "required" first. A tenant that switches the
    // requirement off must not still be blocked by yesterday's failed item.
    const failed = snapshot([item({ status: 'FAILED', isCritical: true })]);
    const v = evaluateTripStartGate(
      input({ tenantRequiresInspection: false, currentInspection: failed })
    );
    expect(v.kind).toBe('ALLOWED');
  });
});

describe('evaluateTripStartGate — owner override', () => {
  const override = { byUserId: 'owner-1', reason: 'Mechanic cleared it on site', at: NOW };

  it('allows a start even with an unstarted inspection (override BEFORE a failure)', () => {
    const v = evaluateTripStartGate(input({ override }));
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('OWNER_OVERRIDE');
  });

  it('allows a start over a critical failure (override AFTER a failure)', () => {
    const failed = snapshot([item({ status: 'FAILED', isCritical: true })]);
    const v = evaluateTripStartGate(input({ override, currentInspection: failed }));
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('OWNER_OVERRIDE');
  });

  it('carries the reason through so it can be shown, not just recorded', () => {
    const v = evaluateTripStartGate(input({ override }));
    expect(v.kind === 'ALLOWED' && v.via === 'OWNER_OVERRIDE' && v.override.reason).toBe(
      'Mechanic cleared it on site'
    );
  });
});

describe('evaluateTripStartGate — a valid inspection already today', () => {
  const passed = [item({ status: 'COMPLETE' }), item({ stepInstanceId: 's2', status: 'SKIPPED' })];

  it('skips the checklist for a complete inspection inside the window', () => {
    const prior = snapshot(passed, {
      lastAnsweredAt: new Date(NOW.getTime() - 2 * 3_600_000),
    });
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('PRIOR_INSPECTION');
  });

  it('re-opens the checklist once the window has passed', () => {
    const prior = snapshot(passed, {
      lastAnsweredAt: new Date(
        NOW.getTime() - (INSPECTION_VALIDITY_HOURS + 1) * 3_600_000
      ),
    });
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });

  it('accepts an inspection exactly on the window boundary', () => {
    const prior = snapshot(passed, { lastAnsweredAt: inspectionValidFrom(NOW) });
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind === 'ALLOWED' && v.via).toBe('PRIOR_INSPECTION');
  });

  it('will NOT launder a critical failure through the validity window', () => {
    // A prior inspection with a critical failure must not clear today's gate.
    // Otherwise "already inspected today" becomes a way to drive a truck whose
    // brake check failed this morning.
    const prior = snapshot([item({ status: 'FAILED', isCritical: true })], {
      lastAnsweredAt: new Date(NOW.getTime() - 3_600_000),
    });
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });

  it('does accept a prior inspection whose only failures were non-critical', () => {
    const prior = snapshot(
      [item({ status: 'FAILED', isCritical: false }), item({ stepInstanceId: 's2' })],
      { lastAnsweredAt: new Date(NOW.getTime() - 3_600_000) }
    );
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind === 'ALLOWED' && v.via).toBe('PRIOR_INSPECTION');
  });

  it('ignores an incomplete prior inspection', () => {
    const prior = snapshot([item({ status: 'NOT_STARTED' })]);
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });

  it('ignores a prior inspection with no answered timestamp at all', () => {
    // This is the shape a PlaybookInstance would have if we had read its own
    // never-written `completedAt` instead of MAX(StepInstance.completedAt).
    const prior = snapshot(passed, { lastAnsweredAt: null });
    const v = evaluateTripStartGate(input({ priorInspection: prior }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });
});

describe('evaluateTripStartGate — outcomes', () => {
  it('reports how many items are still unanswered', () => {
    const current = snapshot([
      item({ stepInstanceId: 'a', status: 'COMPLETE' }),
      item({ stepInstanceId: 'b', status: 'NOT_STARTED' }),
      item({ stepInstanceId: 'c', status: 'IN_PROGRESS' }),
    ]);
    const v = evaluateTripStartGate(input({ currentInspection: current }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
    expect(v.kind === 'INSPECTION_REQUIRED' && v.unanswered).toBe(2);
  });

  it('counts N/A (SKIPPED) as answered', () => {
    const current = snapshot([item({ status: 'SKIPPED' })]);
    const v = evaluateTripStartGate(input({ currentInspection: current }));
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('PASSED');
  });

  it('all pass starts the trip', () => {
    const current = snapshot([item(), item({ stepInstanceId: 'b' })]);
    const v = evaluateTripStartGate(input({ currentInspection: current }));
    expect(v.kind === 'ALLOWED' && v.via).toBe('PASSED');
  });

  it('non-critical failures start the trip and hand back the defects to log', () => {
    const current = snapshot([
      item({ stepInstanceId: 'a', status: 'FAILED', isCritical: false, note: 'Mudflap torn' }),
      item({ stepInstanceId: 'b', status: 'COMPLETE' }),
    ]);
    const v = evaluateTripStartGate(input({ currentInspection: current }));
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('PASSED_WITH_DEFECTS');
    expect(v.kind === 'ALLOWED' && v.via === 'PASSED_WITH_DEFECTS' && v.defects).toHaveLength(1);
  });

  it('a critical failure blocks when the tenant setting is on', () => {
    const current = snapshot([
      item({ stepInstanceId: 'a', status: 'FAILED', isCritical: true }),
      item({ stepInstanceId: 'b', status: 'FAILED', isCritical: false }),
    ]);
    const v = evaluateTripStartGate(input({ currentInspection: current, tenantBlocksOnFailure: true }));
    expect(v.kind).toBe('BLOCKED');
    // The blocked screen lists everything that failed, but only the critical
    // ones are the reason — both lists are needed and they are not the same.
    expect(v.kind === 'BLOCKED' && v.failures).toHaveLength(2);
    expect(v.kind === 'BLOCKED' && v.criticalFailures).toHaveLength(1);
  });

  it('the same critical failure does NOT block when the setting is off', () => {
    const current = snapshot([item({ status: 'FAILED', isCritical: true })]);
    const v = evaluateTripStartGate(
      input({ currentInspection: current, tenantBlocksOnFailure: false })
    );
    expect(v.kind).toBe('ALLOWED');
    expect(v.kind === 'ALLOWED' && v.via).toBe('PASSED_WITH_DEFECTS');
  });

  it('an empty item list is never "complete"', () => {
    // A playbook with no inspection items must not read as a passed inspection.
    const current = snapshot([]);
    const v = evaluateTripStartGate(input({ currentInspection: current }));
    expect(v.kind).toBe('INSPECTION_REQUIRED');
  });
});

describe('helpers', () => {
  it('isInspectionComplete is false for an empty checklist', () => {
    expect(isInspectionComplete(snapshot([]))).toBe(false);
  });

  it('failedItems returns only FAILED, not SKIPPED', () => {
    const s = snapshot([
      item({ stepInstanceId: 'a', status: 'FAILED' }),
      item({ stepInstanceId: 'b', status: 'SKIPPED' }),
      item({ stepInstanceId: 'c', status: 'COMPLETE' }),
    ]);
    expect(failedItems(s).map((i) => i.stepInstanceId)).toEqual(['a']);
  });

  it('inspectionValidFrom uses the shared constant', () => {
    const from = inspectionValidFrom(NOW);
    expect(NOW.getTime() - from.getTime()).toBe(INSPECTION_VALIDITY_HOURS * 3_600_000);
  });
});
