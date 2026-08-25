/**
 * Phase 9 — the trip-start inspection gate, as a pure function.
 *
 * Spec Section 12 draws the decision as a flowchart, and this file is that
 * flowchart and nothing else: no Prisma, no `after()`, no fetch. Everything it
 * needs arrives as an argument, which is what makes the whole ladder testable
 * without a database — and the reason a faked DB in a unit test is not evidence
 * (DEC-14) does not apply here, because there is no DB to fake.
 *
 * The reading side lives in `inspection-lookup.ts`, the writing side in
 * `inspection-service.ts`. Same three-file split as end stop and templates.
 */

import { INSPECTION_VALIDITY_HOURS } from './inspection-constants';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One inspection item's outcome, read off a StepInstance. */
export interface InspectionItemOutcome {
  stepInstanceId: string;
  name: string;
  /**
   * From `stepSnapshot.isDispatchBlocker` — the repo's existing marker for a
   * critical item, snapshotted at instance creation so a later template edit
   * cannot retroactively change what a running checklist meant. Read it from the
   * snapshot, never from the live `PlaybookStep`; `computeDispatchReadiness`
   * makes the same point in the same words.
   */
  isCritical: boolean;
  /** Live `StepStatus`: NOT_STARTED | IN_PROGRESS | COMPLETE | FAILED | SKIPPED. */
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SKIPPED';
  note: string | null;
  photoKeys: string[];
  completedAt: Date | null;
}

export interface InspectionSnapshot {
  playbookInstanceId: string;
  /** The trip this inspection was run against, when the playbook is DISPATCH-scoped. */
  dispatchId: string | null;
  truckId: string | null;
  /** The `User.id` who answered the items — not the CarrierDriver id. */
  completedByUserId: string | null;
  items: InspectionItemOutcome[];
  /**
   * Latest `StepInstance.completedAt` across the items.
   *
   * NOT `PlaybookInstance.completedAt`: nothing in this repo ever writes that
   * column. Checked against production — 27 instances, 0 with `completedAt`,
   * 0 with `startedAt`. Reading it would have made every inspection look
   * infinitely stale and re-opened the checklist on every single start.
   */
  lastAnsweredAt: Date | null;
}

export interface TripStartGateInput {
  /** `Tenant.requirePreTripInspection`. */
  tenantRequiresInspection: boolean;
  /** `Tenant.blockTripStartOnFailedInspection` — defaults to true in the DB. */
  tenantBlocksOnFailure: boolean;
  /** `Trip.inspectionRequired` — null means "fall back to the tenant setting". */
  tripInspectionRequired: boolean | null;
  /** Set when an owner has already overridden this trip's gate. */
  override: { byUserId: string; reason: string; at: Date } | null;
  /** The inspection run for THIS trip, if one has been started. */
  currentInspection: InspectionSnapshot | null;
  /**
   * The most recent completed inspection for this truck by this driver,
   * whatever trip it belonged to. Section 12's second diamond.
   */
  priorInspection: InspectionSnapshot | null;
  now: Date;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type TripStartVerdict =
  | { kind: 'ALLOWED'; via: 'NOT_REQUIRED' }
  | { kind: 'ALLOWED'; via: 'OWNER_OVERRIDE'; override: { byUserId: string; reason: string; at: Date } }
  | { kind: 'ALLOWED'; via: 'PRIOR_INSPECTION'; playbookInstanceId: string; answeredAt: Date }
  | { kind: 'ALLOWED'; via: 'PASSED'; playbookInstanceId: string }
  | {
      kind: 'ALLOWED';
      via: 'PASSED_WITH_DEFECTS';
      playbookInstanceId: string;
      defects: InspectionItemOutcome[];
    }
  | { kind: 'INSPECTION_REQUIRED'; playbookInstanceId: string | null; unanswered: number }
  | {
      kind: 'BLOCKED';
      playbookInstanceId: string;
      /** Every failure, critical or not — the blocked screen lists all of them. */
      failures: InspectionItemOutcome[];
      /** The subset that actually blocks. Never empty when kind is BLOCKED. */
      criticalFailures: InspectionItemOutcome[];
    };

export type AllowedVia = Extract<TripStartVerdict, { kind: 'ALLOWED' }>['via'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Is an inspection still inside its validity window?
 *
 * Exported so the lookup can narrow its query with the same arithmetic the
 * verdict uses. Two implementations of one window is how a gate ends up
 * disagreeing with the screen that explains it.
 */
export function inspectionValidFrom(now: Date): Date {
  return new Date(now.getTime() - INSPECTION_VALIDITY_HOURS * 3_600_000);
}

function isWithinWindow(answeredAt: Date | null, now: Date): boolean {
  if (!answeredAt) return false;
  // A future timestamp means clock skew, not validity. Treat it as valid rather
  // than forcing a re-walkaround over a few seconds of drift; it can only come
  // from our own server clock, since drivers do not supply this value.
  return answeredAt.getTime() >= inspectionValidFrom(now).getTime();
}

/** An item nobody has answered yet. SKIPPED (= N/A) counts as answered. */
function isUnanswered(item: InspectionItemOutcome): boolean {
  return item.status === 'NOT_STARTED' || item.status === 'IN_PROGRESS';
}

export function isInspectionComplete(snapshot: InspectionSnapshot): boolean {
  return snapshot.items.length > 0 && !snapshot.items.some(isUnanswered);
}

export function failedItems(snapshot: InspectionSnapshot): InspectionItemOutcome[] {
  return snapshot.items.filter((i) => i.status === 'FAILED');
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Section 12's flowchart, top to bottom.
 *
 * Order matters and is not cosmetic:
 *
 *   1. NOT REQUIRED wins over everything. If the tenant does not require an
 *      inspection, a stale failed one from a previous configuration must not
 *      strand a driver — turning the setting off has to actually turn it off.
 *   2. OWNER OVERRIDE outranks the inspection outcome, because item 5 says the
 *      override may be granted "before or after a failure". Before means the
 *      driver never sees the checklist at all.
 *   3. PRIOR INSPECTION is checked before the current one, matching the drawing
 *      — the second diamond sits above the checklist box.
 *   4. Only then is this trip's own inspection read.
 */
export function evaluateTripStartGate(input: TripStartGateInput): TripStartVerdict {
  const {
    tenantRequiresInspection,
    tenantBlocksOnFailure,
    tripInspectionRequired,
    override,
    currentInspection,
    priorInspection,
    now,
  } = input;

  // ── 1. Is an inspection required for this trip? ──────────────────────────
  // Per-trip value wins when set; null means "fall back to the tenant setting",
  // which is exactly what the column's schema comment says.
  const required = tripInspectionRequired ?? tenantRequiresInspection;
  if (!required) return { kind: 'ALLOWED', via: 'NOT_REQUIRED' };

  // ── 2. Owner override ────────────────────────────────────────────────────
  if (override) return { kind: 'ALLOWED', via: 'OWNER_OVERRIDE', override };

  // ── 3. A valid one already, this truck, this driver ──────────────────────
  if (
    priorInspection &&
    isInspectionComplete(priorInspection) &&
    isWithinWindow(priorInspection.lastAnsweredAt, now) &&
    // A prior inspection only clears the gate if it PASSED its critical items.
    // Carrying yesterday's cracked brake line forward as "already inspected"
    // would turn the validity window into a way to launder a blocking failure.
    !failedItems(priorInspection).some((i) => i.isCritical)
  ) {
    return {
      kind: 'ALLOWED',
      via: 'PRIOR_INSPECTION',
      playbookInstanceId: priorInspection.playbookInstanceId,
      answeredAt: priorInspection.lastAnsweredAt!,
    };
  }

  // ── 4. This trip's own inspection ────────────────────────────────────────
  if (!currentInspection) {
    return { kind: 'INSPECTION_REQUIRED', playbookInstanceId: null, unanswered: 0 };
  }

  if (!isInspectionComplete(currentInspection)) {
    return {
      kind: 'INSPECTION_REQUIRED',
      playbookInstanceId: currentInspection.playbookInstanceId,
      unanswered: currentInspection.items.filter(isUnanswered).length,
    };
  }

  const failures = failedItems(currentInspection);
  if (failures.length === 0) {
    return { kind: 'ALLOWED', via: 'PASSED', playbookInstanceId: currentInspection.playbookInstanceId };
  }

  const criticalFailures = failures.filter((f) => f.isCritical);

  // Any critical failure blocks — but ONLY when the tenant setting says so.
  // With the setting off, a critical failure still logs its defect and still
  // shows on the trip; it just does not stop the wheels. That is the tenant's
  // call to make, and the record of the failure is identical either way.
  if (criticalFailures.length > 0 && tenantBlocksOnFailure) {
    return {
      kind: 'BLOCKED',
      playbookInstanceId: currentInspection.playbookInstanceId,
      failures,
      criticalFailures,
    };
  }

  return {
    kind: 'ALLOWED',
    via: 'PASSED_WITH_DEFECTS',
    playbookInstanceId: currentInspection.playbookInstanceId,
    defects: failures,
  };
}
