/**
 * Pure helper: derive driver dispatch readiness from LIVE step instances.
 *
 * Extracted from the getDriverReadiness resolver (instance.ts) so the
 * "never dead-ends" invariant is provable in a unit test without mocking
 * tRPC/Prisma. No I/O, no framework imports.
 *
 * Convention (mirrors computeDispatchReadiness.ts):
 *   - "open" step status: NOT_STARTED | IN_PROGRESS | FAILED
 *   - "complete" step status: COMPLETE | SKIPPED
 *   - a "blocker" step has stepSnapshot.isDispatchBlocker === true
 *
 * INVARIANT: isReady is DEFINED as `blockerStepNames.length === 0` — by
 * construction, this function can never return { isReady:false, blockerStepNames:[] }.
 */

const OPEN_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'FAILED']);

export interface DriveableStepInstance {
  status: string;
  stepSnapshot: unknown;
}

export interface DriveablePlaybookInstance {
  id: string;
  stepInstances: DriveableStepInstance[];
}

export interface DriverReadinessResult {
  isReady: boolean;
  blockerStepNames: string[];
  openInstanceId: string | null;
}

export function deriveDriverReadiness(
  activeInstances: DriveablePlaybookInstance[]
): DriverReadinessResult {
  const blockerStepNames: string[] = [];
  let openInstanceId: string | null = null;

  for (const inst of activeInstances) {
    let instanceHasOpenBlocker = false;

    for (const step of inst.stepInstances) {
      if (!OPEN_STATUSES.has(step.status)) continue;

      const snap = step.stepSnapshot as { isDispatchBlocker?: boolean; title?: string; name?: string };
      if (snap.isDispatchBlocker === true) {
        blockerStepNames.push(snap.title ?? snap.name ?? 'Required step');
        instanceHasOpenBlocker = true;
      }
    }

    if (instanceHasOpenBlocker && !openInstanceId) {
      openInstanceId = inst.id;
    }
  }

  // Fall back to the first instance's id when no instance has an open blocker
  // (e.g. all-non-blocker open steps, or all steps complete) so "View Checklist"
  // still has somewhere to link when instances exist.
  if (!openInstanceId && activeInstances.length > 0) {
    openInstanceId = activeInstances[0].id;
  }

  return {
    // Defined as a function of blockerStepNames — cannot diverge from it.
    isReady: blockerStepNames.length === 0,
    blockerStepNames,
    openInstanceId,
  };
}
