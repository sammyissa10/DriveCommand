/**
 * state-machine.ts — Per-assignment (LoadDriverAssignment) pay-status FSM.
 *
 * NOTE: Settlement-level status transitions (DRAFT → FINALIZED → PAID → VOIDED)
 * do NOT live here. They live in the individual route handlers:
 *   - FINALIZED: apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
 *   - PAID:      apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts
 *   - VOIDED:    apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
 * This file only governs per-component PayStatus transitions used by the
 * settlement generation engine and approval workflow.
 */

import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'PAID'
  | 'DISPUTED'
  | 'CORRECTED';

export type TransitionAction = 'submit' | 'approve' | 'dispute' | 'correct' | 'reject';

export interface AssignmentSnapshotForFsm {
  payStatus: PayStatus;
  paymentModel: 'CPM' | 'FLAT' | 'PERCENTAGE' | 'HOURLY' | 'DAILY';
  actualMiles: string | null;       // Decimal as string
  mileageSource: string | null;
  loadRevenue: string | null;       // Decimal as string
  overrideReason: string | null;
  isOverride: boolean;              // true if any snapshot field differs from template
  settlementId: string | null;
}

export interface ComponentSnapshotForFsm {
  componentType: string;   // e.g. 'BASE_PAY_CPM', 'ADJUSTMENT_POSITIVE'
  category: string;        // 'BASE_PAY' | 'ACCESSORIAL' | 'DEDUCTION' | 'ALLOWANCE' | 'REIMBURSEMENT' | 'ADJUSTMENT'
  originalComponentId: string | null;
  grossAmount: string;     // Decimal as string
}

export type TransitionResult =
  | { ok: true; nextStatus: PayStatus }
  | { ok: false; reason: string; actionHint?: string };

// ---------------------------------------------------------------------------
// Labels for audit log action strings
// ---------------------------------------------------------------------------

export const TRANSITION_LABELS: Record<TransitionAction, string> = {
  submit: 'Submitted for review',
  approve: 'Approved',
  dispute: 'Disputed',
  correct: 'Corrected',
  reject: 'Rejected — sent back to draft',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the next PayStatus for a given (current, action) pair, or null
 * if the transition is invalid. Does NOT check pre-conditions.
 * Used by the API to write the status after canTransition succeeds.
 */
export function nextStatusFor(
  current: PayStatus,
  action: TransitionAction,
): PayStatus | null {
  const map: Partial<Record<`${PayStatus}:${TransitionAction}`, PayStatus>> = {
    'DRAFT:submit': 'PENDING_REVIEW',
    'PENDING_REVIEW:approve': 'APPROVED',
    'PENDING_REVIEW:dispute': 'DISPUTED',
    'PENDING_REVIEW:reject': 'DRAFT',
    'APPROVED:dispute': 'DISPUTED',
    'DISPUTED:submit': 'PENDING_REVIEW',
    'DISPUTED:reject': 'DRAFT',
    'PAID:correct': 'CORRECTED',
    'CORRECTED:correct': 'CORRECTED',
  };
  return map[`${current}:${action}`] ?? null;
}

/**
 * Returns the ADJUSTMENT componentType for a given numeric amount.
 * Positive → 'ADJUSTMENT_POSITIVE'
 * Negative → 'ADJUSTMENT_NEGATIVE'
 * Zero → throws
 */
export function adjustmentTypeFor(
  amount: number | string,
): 'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE' {
  const d = new Decimal(amount);
  if (d.isZero()) {
    throw new Error('Amount must be non-zero to determine adjustment type.');
  }
  return d.isPositive() ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE';
}

// ---------------------------------------------------------------------------
// Pre-condition checkers
// ---------------------------------------------------------------------------

function hasBasePayComponent(components: ComponentSnapshotForFsm[]): boolean {
  return components.some((c) => c.componentType.startsWith('BASE_PAY_'));
}

function hasAdjustmentComponent(components: ComponentSnapshotForFsm[]): boolean {
  return components.some(
    (c) =>
      c.category === 'ADJUSTMENT' ||
      c.componentType === 'ADJUSTMENT_POSITIVE' ||
      c.componentType === 'ADJUSTMENT_NEGATIVE',
  );
}

function loadRevenueIsPositive(loadRevenue: string | null): boolean {
  if (!loadRevenue) return false;
  try {
    return new Decimal(loadRevenue).gt(0);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Submit pre-conditions (shared by DRAFT→submit and DISPUTED→submit)
// ---------------------------------------------------------------------------

function checkSubmitPreconditions(
  assignment: AssignmentSnapshotForFsm,
  components: ComponentSnapshotForFsm[],
): TransitionResult | null {
  if (!hasBasePayComponent(components)) {
    return {
      ok: false,
      reason: "This assignment doesn't have a base pay line yet.",
      actionHint:
        'Add a base pay component (mileage, flat, percentage, hourly, or daily) before submitting for review.',
    };
  }

  if (assignment.isOverride && !assignment.overrideReason?.trim()) {
    return {
      ok: false,
      reason: 'An override is in place but no reason was given.',
      actionHint:
        'Open the override form and add a short reason describing why this assignment differs from the template.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Approve pre-conditions
// ---------------------------------------------------------------------------

function checkApprovePreconditions(
  assignment: AssignmentSnapshotForFsm,
): TransitionResult | null {
  if (assignment.paymentModel === 'CPM') {
    if (!assignment.actualMiles || !assignment.mileageSource) {
      return {
        ok: false,
        reason: "Cannot approve — actual miles haven't been recorded.",
        actionHint:
          "Open the load and confirm the trip's actual miles + mileage source (Google, manual, etc.), then try again.",
      };
    }
  }

  if (assignment.paymentModel === 'PERCENTAGE') {
    if (!loadRevenueIsPositive(assignment.loadRevenue)) {
      return {
        ok: false,
        reason: 'Cannot approve — load revenue is missing or zero.',
        actionHint:
          "Set the load's revenue (rate confirmation total) on the load page, then try again.",
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main state machine function
// ---------------------------------------------------------------------------

/**
 * Pure function — no Prisma, no React, no Next.js.
 * Returns a discriminated union indicating whether the transition is allowed.
 */
export function canTransition(
  assignment: AssignmentSnapshotForFsm,
  action: TransitionAction,
  components: ComponentSnapshotForFsm[],
): TransitionResult {
  const current = assignment.payStatus;

  // NOTE: APPROVED → PAID is reserved for Phase 8's settlement engine.
  // The settlement engine writes the status directly with a settlementId.
  // Do not expose that transition here.

  switch (`${current}:${action}` as `${PayStatus}:${TransitionAction}`) {
    // ── DRAFT ─────────────────────────────────────────────────────────────────
    case 'DRAFT:submit': {
      const err = checkSubmitPreconditions(assignment, components);
      if (err) return err;
      return { ok: true, nextStatus: 'PENDING_REVIEW' };
    }

    // ── PENDING_REVIEW ────────────────────────────────────────────────────────
    case 'PENDING_REVIEW:approve': {
      const err = checkApprovePreconditions(assignment);
      if (err) return err;
      return { ok: true, nextStatus: 'APPROVED' };
    }

    case 'PENDING_REVIEW:dispute':
      return { ok: true, nextStatus: 'DISPUTED' };

    case 'PENDING_REVIEW:reject':
      return { ok: true, nextStatus: 'DRAFT' };

    // ── APPROVED ──────────────────────────────────────────────────────────────
    case 'APPROVED:dispute':
      return { ok: true, nextStatus: 'DISPUTED' };

    case 'APPROVED:submit':
      // Only the settlement engine can move APPROVED → PAID
      return {
        ok: false,
        reason: `Cannot transition from ${current} via ${action}.`,
        actionHint: 'Refresh the page — the assignment status may have changed since you opened it.',
      };

    // ── DISPUTED ──────────────────────────────────────────────────────────────
    case 'DISPUTED:submit': {
      const err = checkSubmitPreconditions(assignment, components);
      if (err) return err;
      return { ok: true, nextStatus: 'PENDING_REVIEW' };
    }

    case 'DISPUTED:reject':
      return { ok: true, nextStatus: 'DRAFT' };

    // ── PAID ──────────────────────────────────────────────────────────────────
    case 'PAID:correct': {
      if (!hasAdjustmentComponent(components)) {
        return {
          ok: false,
          reason: 'Cannot mark as corrected without an adjustment line.',
          actionHint: 'Use the Correction modal to add an adjustment first.',
        };
      }
      return { ok: true, nextStatus: 'CORRECTED' };
    }

    // ── CORRECTED ─────────────────────────────────────────────────────────────
    case 'CORRECTED:correct': {
      if (!hasAdjustmentComponent(components)) {
        return {
          ok: false,
          reason: 'Cannot mark as corrected without an adjustment line.',
          actionHint: 'Use the Correction modal to add an adjustment first.',
        };
      }
      return { ok: true, nextStatus: 'CORRECTED' };
    }

    // ── Catch-all unsupported transitions ─────────────────────────────────────
    default:
      return {
        ok: false,
        reason: `Cannot transition from ${current} via ${action}.`,
        actionHint:
          'Refresh the page — the assignment status may have changed since you opened it.',
      };
  }
}
