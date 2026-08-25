/**
 * Phase 9 — transport-neutral handlers for the inspection gate.
 *
 * Same shape as the document-import module's `handlers.ts` (Phase 2): the logic
 * lives here once, and the two route files under `/api/v1/*` (session cookie)
 * and `/api/mobile/*` (Bearer token) are thin adapters that supply
 * `{ orgId, userId }` and translate the result into a `NextResponse`.
 *
 * Nothing in this file reads a header, a cookie or a request. That is what makes
 * one implementation serve both surfaces, and it is why the gate cannot acquire
 * the E251 defect that `sendDispatchAssignedNotification` has.
 */

import { logger, serializeError } from '@/lib/logger';
import { transitionTripStatus } from '@/lib/carrier/trips';
import {
  evaluateTripGate,
  ensureTripInspection,
  applyVerdictSideEffects,
  overrideInspection,
  isGateError,
  type TripGateContext,
} from './inspection-service';
import { listInspectionSteps, signatureState } from './inspection-lookup';
import type { InspectionItemOutcome, TripStartVerdict } from './inspection-gate';
import { FAIL_NOTE_MIN_LENGTH, INSPECTION_VALIDITY_HOURS } from './inspection-constants';
// Imported (not merely re-exported) because `buildChecklistView` below calls both.
import { sectionOf, requiresPhotoOnFail } from './inspection-snapshot';

// ---------------------------------------------------------------------------
// Wire types — shared verbatim with mobile via packages/api-client
// ---------------------------------------------------------------------------

export interface InspectionFailureView {
  stepInstanceId: string;
  name: string;
  isCritical: boolean;
  note: string | null;
  photoCount: number;
}

export interface InspectionGateView {
  dispatchId: string;
  truckUnitNumber: string;
  tripStatus: string;
  /** Can the driver press Start right now? */
  canStart: boolean;
  /** Why — one of the gate's verdict kinds, flattened for the client. */
  outcome:
    | 'NOT_REQUIRED'
    | 'OWNER_OVERRIDE'
    | 'PRIOR_INSPECTION'
    | 'PASSED'
    | 'PASSED_WITH_DEFECTS'
    | 'INSPECTION_REQUIRED'
    | 'BLOCKED';
  /** One plain sentence, ready to render. Never assembled from fragments in JSX. */
  message: string;
  playbookInstanceId: string | null;
  unanswered: number;
  failures: InspectionFailureView[];
  criticalFailures: InspectionFailureView[];
  override: { reason: string; at: string; byName: string | null } | null;
  priorInspectionAt: string | null;
  validityHours: number;
}

export interface InspectionStepView {
  stepInstanceId: string;
  name: string;
  description: string | null;
  /** INSPECTION_ITEM | SIGNATURE | anything else the tenant put in the playbook. */
  stepType: string;
  isCritical: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SKIPPED';
  note: string | null;
  photoKeys: string[];
  /** Section grouping — see `sectionOf` below. */
  section: string;
  requiresPhotoOnFail: boolean;
}

export interface InspectionChecklistView {
  dispatchId: string;
  playbookInstanceId: string;
  playbookName: string;
  truckUnitNumber: string;
  driverName: string | null;
  sections: Array<{ title: string; steps: InspectionStepView[] }>;
  signature: { required: boolean; signed: boolean; stepInstanceId: string | null };
  failNoteMinLength: number;
}

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

// ---------------------------------------------------------------------------
// Copy — one string per sentence
// ---------------------------------------------------------------------------

/**
 * Every user-facing sentence with a count in it is built HERE, as one string,
 * and never assembled from JSX children.
 *
 * quick-517 spent two investigations on `<p>{n} stop{n===1?'':'s'} …</p>`
 * rendering "4 stopswill" — four children, three of them whitespace-sensitive,
 * and JSX trimming was blamed twice and was wrong both times. One string per
 * sentence removes the boundary rather than the suspect.
 */
export const inspectionCopy = {
  notRequired: 'No pre-trip inspection is required for this trip.',

  ownerOverride: (byName: string | null): string =>
    byName
      ? `${byName} overrode the inspection requirement for this trip.`
      : 'A manager overrode the inspection requirement for this trip.',

  priorInspection: (hours: number): string =>
    hours <= 1
      ? 'You inspected this truck within the last hour. No new walkaround needed.'
      : `You inspected this truck ${hours} hours ago. No new walkaround needed.`,

  passed: 'Inspection complete — everything passed.',

  passedWithDefects: (n: number): string =>
    n === 1
      ? '1 item was flagged. It has been logged against the truck and the trip can start.'
      : `${n} items were flagged. They have been logged against the truck and the trip can start.`,

  inspectionRequired: (unanswered: number): string =>
    unanswered === 0
      ? 'A pre-trip inspection is required before this trip can start.'
      : unanswered === 1
        ? '1 inspection item still needs an answer.'
        : `${unanswered} inspection items still need an answer.`,

  blocked: (n: number): string =>
    n === 1
      ? 'This trip cannot start. 1 critical item failed inspection.'
      : `This trip cannot start. ${n} critical items failed inspection.`,

  dispatchNotified: 'Your dispatcher has been notified and can clear this.',
} as const;

function hoursSince(then: Date, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - then.getTime()) / 3_600_000));
}

// ---------------------------------------------------------------------------
// Snapshot readers — re-exported, defined in `inspection-snapshot.ts`
// ---------------------------------------------------------------------------

/**
 * `sectionOf` and `requiresPhotoOnFail` moved to `./inspection-snapshot` in
 * Phase 9-web so `failInspectionItem` can share them.
 *
 * They are pure functions over a JSON blob; this module is not, and a workflow
 * service importing it would drag Prisma, `after()` and the notification stack
 * in behind them. Re-exported here rather than relocated-and-updated at every
 * call site, because the wire types above are the natural place to look for
 * `InspectionStepView.section` and `.requiresPhotoOnFail`.
 */
export { sectionOf, requiresPhotoOnFail };

// ---------------------------------------------------------------------------
// View builders
// ---------------------------------------------------------------------------

function toFailureView(f: InspectionItemOutcome): InspectionFailureView {
  return {
    stepInstanceId: f.stepInstanceId,
    name: f.name,
    isCritical: f.isCritical,
    note: f.note,
    photoCount: f.photoKeys.length,
  };
}

function buildGateView(
  verdict: TripStartVerdict,
  trip: TripGateContext,
  overrideByName: string | null,
  now: Date
): InspectionGateView {
  const base = {
    dispatchId: trip.dispatchId,
    truckUnitNumber: trip.truckUnitNumber,
    tripStatus: trip.status,
    playbookInstanceId: null as string | null,
    unanswered: 0,
    failures: [] as InspectionFailureView[],
    criticalFailures: [] as InspectionFailureView[],
    override: null as InspectionGateView['override'],
    priorInspectionAt: null as string | null,
    validityHours: INSPECTION_VALIDITY_HOURS,
  };

  if (verdict.kind === 'BLOCKED') {
    return {
      ...base,
      canStart: false,
      outcome: 'BLOCKED',
      message: inspectionCopy.blocked(verdict.criticalFailures.length),
      playbookInstanceId: verdict.playbookInstanceId,
      failures: verdict.failures.map(toFailureView),
      criticalFailures: verdict.criticalFailures.map(toFailureView),
    };
  }

  if (verdict.kind === 'INSPECTION_REQUIRED') {
    return {
      ...base,
      canStart: false,
      outcome: 'INSPECTION_REQUIRED',
      message: inspectionCopy.inspectionRequired(verdict.unanswered),
      playbookInstanceId: verdict.playbookInstanceId,
      unanswered: verdict.unanswered,
    };
  }

  switch (verdict.via) {
    case 'NOT_REQUIRED':
      return { ...base, canStart: true, outcome: 'NOT_REQUIRED', message: inspectionCopy.notRequired };
    case 'OWNER_OVERRIDE':
      return {
        ...base,
        canStart: true,
        outcome: 'OWNER_OVERRIDE',
        message: inspectionCopy.ownerOverride(overrideByName),
        override: {
          reason: verdict.override.reason,
          at: verdict.override.at.toISOString(),
          byName: overrideByName,
        },
      };
    case 'PRIOR_INSPECTION':
      return {
        ...base,
        canStart: true,
        outcome: 'PRIOR_INSPECTION',
        message: inspectionCopy.priorInspection(hoursSince(verdict.answeredAt, now)),
        playbookInstanceId: verdict.playbookInstanceId,
        priorInspectionAt: verdict.answeredAt.toISOString(),
      };
    case 'PASSED':
      return {
        ...base,
        canStart: true,
        outcome: 'PASSED',
        message: inspectionCopy.passed,
        playbookInstanceId: verdict.playbookInstanceId,
      };
    case 'PASSED_WITH_DEFECTS':
      return {
        ...base,
        canStart: true,
        outcome: 'PASSED_WITH_DEFECTS',
        message: inspectionCopy.passedWithDefects(verdict.defects.length),
        playbookInstanceId: verdict.playbookInstanceId,
        failures: verdict.defects.map(toFailureView),
      };
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET the gate state for a trip. Pure read — no writes, no side effects. */
export async function handleGetGate(args: {
  orgId: string;
  dispatchId: string;
}): Promise<HandlerResult<InspectionGateView>> {
  const { orgId, dispatchId } = args;
  const now = new Date();

  const result = await evaluateTripGate(orgId, dispatchId, now);
  if (!result) return { ok: false, status: 404, error: 'Trip not found' };

  let overrideByName: string | null = null;
  if (result.verdict.kind === 'ALLOWED' && result.verdict.via === 'OWNER_OVERRIDE') {
    overrideByName = await resolveUserName(orgId, result.verdict.override.byUserId);
  }

  return { ok: true, data: buildGateView(result.verdict, result.trip, overrideByName, now) };
}

async function resolveUserName(orgId: string, userId: string): Promise<string | null> {
  try {
    const { getTenantPrismaForOrg } = await import('@/lib/context/tenant-context');
    const tenantPrisma = await getTenantPrismaForOrg(orgId);
    const user = await tenantPrisma.user.findFirst({
      where: { id: userId, tenantId: orgId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.email;
  } catch (err) {
    // A missing name degrades the sentence to "A manager overrode…", which is
    // still true and still renders. It must not take the gate down.
    logger.error('[inspection-handlers] resolveUserName failed', err, {
      orgId,
      userId,
      error: serializeError(err),
    });
    return null;
  }
}

/**
 * Open (or re-open) the checklist for a trip and return every step, grouped.
 *
 * This one DOES write, once: it creates the PlaybookInstance if the tenant has
 * no ON_DISPATCH_CREATE trigger. That is a POST on both surfaces for exactly the
 * reason quick-516 gives — anything that can change stored state is a POST.
 */
export async function handleOpenChecklist(args: {
  orgId: string;
  dispatchId: string;
  userId: string;
}): Promise<HandlerResult<InspectionChecklistView>> {
  const { orgId, dispatchId, userId } = args;

  const gate = await evaluateTripGate(orgId, dispatchId);
  if (!gate) return { ok: false, status: 404, error: 'Trip not found' };

  const ensured = await ensureTripInspection({
    orgId,
    dispatchId,
    truckId: gate.trip.truckId,
    userId,
  });
  if (isGateError(ensured)) {
    return { ok: false, status: 409, error: ensured.error, code: ensured.code };
  }

  const view = await buildChecklistView(orgId, dispatchId, ensured.playbookInstanceId, gate.trip);
  if (!view) return { ok: false, status: 404, error: 'Inspection checklist not found' };
  return { ok: true, data: view };
}

/** Read the checklist without creating anything. Safe on a GET. */
export async function handleGetChecklist(args: {
  orgId: string;
  dispatchId: string;
  playbookInstanceId: string;
}): Promise<HandlerResult<InspectionChecklistView>> {
  const { orgId, dispatchId, playbookInstanceId } = args;
  const gate = await evaluateTripGate(orgId, dispatchId);
  if (!gate) return { ok: false, status: 404, error: 'Trip not found' };

  const view = await buildChecklistView(orgId, dispatchId, playbookInstanceId, gate.trip);
  if (!view) return { ok: false, status: 404, error: 'Inspection checklist not found' };
  return { ok: true, data: view };
}

async function buildChecklistView(
  orgId: string,
  dispatchId: string,
  playbookInstanceId: string,
  trip: TripGateContext
): Promise<InspectionChecklistView | null> {
  const loaded = await listInspectionSteps(orgId, playbookInstanceId);
  if (!loaded) return null;

  const { instance, ordered } = loaded;

  const steps: InspectionStepView[] = ordered.map((s) => {
    const snap = (s.stepSnapshot ?? {}) as {
      name?: string;
      description?: string | null;
      stepType?: string;
      isDispatchBlocker?: boolean;
    };
    const result = (s.result ?? {}) as { note?: unknown; photoUrls?: unknown };
    return {
      stepInstanceId: s.id,
      name: snap.name ?? 'Inspection item',
      description: snap.description ?? null,
      stepType: snap.stepType ?? 'INSPECTION_ITEM',
      isCritical: snap.isDispatchBlocker === true,
      status: s.status as InspectionStepView['status'],
      note: typeof result.note === 'string' ? result.note : null,
      photoKeys: Array.isArray(result.photoUrls)
        ? result.photoUrls.filter((k): k is string => typeof k === 'string')
        : [],
      section: sectionOf(s.stepSnapshot),
      requiresPhotoOnFail: requiresPhotoOnFail(s.stepSnapshot),
    };
  });

  // Group into sections, preserving first-appearance order. A Map keeps that
  // without a second sort — the running order IS the array order, as it is in
  // stop review.
  const grouped = new Map<string, InspectionStepView[]>();
  for (const step of steps) {
    if (step.stepType === 'SIGNATURE') continue; // its own final screen
    const list = grouped.get(step.section) ?? [];
    list.push(step);
    grouped.set(step.section, list);
  }

  const sig = signatureState({
    id: instance.id,
    entityType: instance.entityType,
    entityId: instance.entityId,
    stepInstances: ordered.map((s) => ({
      id: s.id,
      status: s.status,
      completedAt: s.completedAt,
      completedByUserId: s.completedByUserId,
      result: s.result,
      stepSnapshot: s.stepSnapshot,
    })),
  });

  const driverName = await resolveDriverName(orgId, trip.driverUserId);

  return {
    dispatchId,
    playbookInstanceId,
    playbookName:
      (instance.playbookSnapshot as { name?: string } | null)?.name ?? 'Pre-Trip Inspection',
    truckUnitNumber: trip.truckUnitNumber,
    driverName,
    sections: [...grouped.entries()].map(([title, list]) => ({ title, steps: list })),
    signature: {
      required: sig.required,
      signed: sig.required ? sig.signed : false,
      stepInstanceId: sig.required ? sig.stepInstanceId : null,
    },
    failNoteMinLength: FAIL_NOTE_MIN_LENGTH,
  };
}

async function resolveDriverName(orgId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return resolveUserName(orgId, userId);
}

/**
 * Submit the finished checklist: apply side effects and report the verdict.
 *
 * Called when the driver signs. Does NOT start the trip — starting is a separate
 * explicit action, so a driver who finishes a walkaround at 04:50 is not put on
 * the road at 04:50.
 */
export async function handleSubmitInspection(args: {
  orgId: string;
  dispatchId: string;
  userId: string;
}): Promise<HandlerResult<InspectionGateView>> {
  const { orgId, dispatchId, userId } = args;
  const now = new Date();

  const result = await evaluateTripGate(orgId, dispatchId, now);
  if (!result) return { ok: false, status: 404, error: 'Trip not found' };

  const effects = await applyVerdictSideEffects({
    orgId,
    verdict: result.verdict,
    trip: result.trip,
    actingUserId: userId,
  });

  logger.info('[inspection] checklist submitted', {
    orgId,
    dispatchId,
    outcome: result.verdict.kind === 'ALLOWED' ? result.verdict.via : result.verdict.kind,
    defectsWritten: effects.defectsWritten,
    dispatchNotified: effects.dispatchNotified,
  });

  let overrideByName: string | null = null;
  if (result.verdict.kind === 'ALLOWED' && result.verdict.via === 'OWNER_OVERRIDE') {
    overrideByName = await resolveUserName(orgId, result.verdict.override.byUserId);
  }

  return { ok: true, data: buildGateView(result.verdict, result.trip, overrideByName, now) };
}

/**
 * Start a trip, through the gate.
 *
 * The gate runs FIRST and `transitionTripStatus` is only reached on an ALLOWED
 * verdict. Putting the check inside `transitionTripStatus` was considered and
 * rejected: that function also serves `completed`/`cancelled`/`tonu`, and a gate
 * living there would have to know which transition it was looking at — a
 * condition someone eventually gets backwards.
 */
export async function handleStartTrip(args: {
  orgId: string;
  dispatchId: string;
  userId: string;
  notes?: string;
}): Promise<HandlerResult<{ id: string; status: string; gate: InspectionGateView }>> {
  const { orgId, dispatchId, userId, notes } = args;
  const now = new Date();

  const result = await evaluateTripGate(orgId, dispatchId, now);
  if (!result) return { ok: false, status: 404, error: 'Trip not found' };

  let overrideByName: string | null = null;
  if (result.verdict.kind === 'ALLOWED' && result.verdict.via === 'OWNER_OVERRIDE') {
    overrideByName = await resolveUserName(orgId, result.verdict.override.byUserId);
  }
  const gateView = buildGateView(result.verdict, result.trip, overrideByName, now);

  if (!gateView.canStart) {
    // Side effects run on the blocked path too — this is the moment dispatch is
    // told, and the moment the defects are written against the truck.
    await applyVerdictSideEffects({
      orgId,
      verdict: result.verdict,
      trip: result.trip,
      actingUserId: userId,
    });
    return {
      ok: false,
      status: 422,
      error: gateView.message,
      code: gateView.outcome,
    };
  }

  await applyVerdictSideEffects({
    orgId,
    verdict: result.verdict,
    trip: result.trip,
    actingUserId: userId,
  });

  const transition = await transitionTripStatus(orgId, dispatchId, 'in_progress', notes);
  if (transition === null) return { ok: false, status: 404, error: 'Trip not found' };
  if ('error' in transition) {
    return { ok: false, status: 422, error: transition.error, code: 'INVALID_TRANSITION' };
  }

  return {
    ok: true,
    data: { id: transition.id, status: transition.status, gate: gateView },
  };
}

/** Owner override. Caller must have already enforced the role. */
export async function handleOverride(args: {
  orgId: string;
  dispatchId: string;
  userId: string;
  reason: unknown;
}): Promise<HandlerResult<InspectionGateView>> {
  const { orgId, dispatchId, userId } = args;

  if (typeof args.reason !== 'string') {
    return { ok: false, status: 400, error: 'A typed reason is required.', code: 'REASON_REQUIRED' };
  }

  const outcome = await overrideInspection({ orgId, dispatchId, userId, reason: args.reason });
  if (isGateError(outcome)) {
    const status = outcome.code === 'NOT_FOUND' ? 404 : outcome.code === 'OVERRIDE_FAILED' ? 500 : 400;
    return { ok: false, status, error: outcome.error, code: outcome.code };
  }

  logger.info('[inspection] gate overridden', {
    orgId,
    dispatchId,
    byUserId: userId,
    defectsWritten: outcome.defectsWritten,
  });

  return handleGetGate({ orgId, dispatchId });
}
