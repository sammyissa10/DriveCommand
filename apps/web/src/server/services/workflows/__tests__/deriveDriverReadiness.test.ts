/**
 * Unit tests for deriveDriverReadiness (quick-497 Task 1).
 *
 * Pure function — no mocks. Proves the acceptance invariant:
 * getDriverReadiness can NEVER return { isReady:false, blockerStepNames:[] }.
 */
import { describe, it, expect } from 'vitest';
import { deriveDriverReadiness } from '../deriveDriverReadiness';

describe('deriveDriverReadiness', () => {
  it('no instances (empty array) → isReady:true, blockerStepNames:[], openInstanceId:null', () => {
    const result = deriveDriverReadiness([]);
    expect(result).toEqual({ isReady: true, blockerStepNames: [], openInstanceId: null });
  });

  it('one instance, one open blocker step → isReady:false, blockerStepNames has the step name, openInstanceId = that instance', () => {
    const result = deriveDriverReadiness([
      {
        id: 'instance-1',
        stepInstances: [
          { status: 'NOT_STARTED', stepSnapshot: { isDispatchBlocker: true, title: "Upload Driver's License" } },
        ],
      },
    ]);

    expect(result.isReady).toBe(false);
    expect(result.blockerStepNames).toHaveLength(1);
    expect(result.blockerStepNames[0]).toBe("Upload Driver's License");
    expect(result.openInstanceId).toBe('instance-1');
  });

  it('one instance, all blocker steps COMPLETE/SKIPPED → isReady:true, blockerStepNames:[]', () => {
    const result = deriveDriverReadiness([
      {
        id: 'instance-1',
        stepInstances: [
          { status: 'COMPLETE', stepSnapshot: { isDispatchBlocker: true, title: 'Upload License' } },
          { status: 'SKIPPED', stepSnapshot: { isDispatchBlocker: true, title: 'Upload Medical Cert' } },
        ],
      },
    ]);

    expect(result.isReady).toBe(true);
    expect(result.blockerStepNames).toEqual([]);
    // Falls back to the first instance id since no OPEN blocker exists
    expect(result.openInstanceId).toBe('instance-1');
  });

  it('a driver with a non-blocker open step only → isReady:true (non-blocker steps never gate)', () => {
    const result = deriveDriverReadiness([
      {
        id: 'instance-1',
        stepInstances: [
          { status: 'NOT_STARTED', stepSnapshot: { isDispatchBlocker: false, title: 'Safety Policy Acknowledgment' } },
        ],
      },
    ]);

    expect(result.isReady).toBe(true);
    expect(result.blockerStepNames).toEqual([]);
  });

  it('invariant: no possible input yields isReady:false with empty blockerStepNames', () => {
    // Sweep a matrix of statuses x isDispatchBlocker combinations across multiple instances
    // and assert the invariant holds for every combination.
    const statuses = ['NOT_STARTED', 'IN_PROGRESS', 'FAILED', 'COMPLETE', 'SKIPPED'];
    const blockerFlags = [true, false, undefined];

    for (const s1 of statuses) {
      for (const b1 of blockerFlags) {
        for (const s2 of statuses) {
          for (const b2 of blockerFlags) {
            const result = deriveDriverReadiness([
              {
                id: 'inst-a',
                stepInstances: [
                  { status: s1, stepSnapshot: { isDispatchBlocker: b1, title: 'Step A' } },
                ],
              },
              {
                id: 'inst-b',
                stepInstances: [
                  { status: s2, stepSnapshot: { isDispatchBlocker: b2, title: 'Step B' } },
                ],
              },
            ]);

            if (result.isReady === false) {
              expect(result.blockerStepNames.length).toBeGreaterThan(0);
            }
            if (result.blockerStepNames.length === 0) {
              expect(result.isReady).toBe(true);
            }
          }
        }
      }
    }
  });
});
