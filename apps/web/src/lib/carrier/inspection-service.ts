/**
 * Phase 9 — the writing half of the inspection gate.
 *
 * Everything that mutates lives here; the decision is `inspection-gate.ts` and
 * the reads are `inspection-lookup.ts`.
 *
 * TENANT CLIENT DISCIPLINE. Every function takes `orgId` explicitly and resolves
 * through `getTenantPrismaForOrg(orgId)`, never `getTenantPrisma()`. That is not
 * style: `getTenantPrisma()` reads the `x-tenant-id` header injected by
 * middleware, which does not exist on `/api/mobile/*` (Bearer auth means no
 * Supabase cookie, so middleware returns early) and does not exist at all inside
 * `after()` — `headers()` throws E251 once the response has been sent.
 * `sendDispatchAssignedNotification` still has that shape and still throws;
 * DEC-11 is the same bug in the page cache. Nothing here repeats it, and the
 * client is always resolved BEFORE any `after()` closure captures it.
 */

import { after } from 'next/server';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import { generatePlaybookInstance } from '@/server/services/workflows/generatePlaybookInstance';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { createNotification } from '@/lib/carrier/in-app-notifications';
// Phase 10 — the Section 13 catalogue path. Runs ALONGSIDE createNotification
// above for the blocked case, never instead of it; see applyVerdictSideEffects.
import { emitNotification } from '@/lib/notifications/emit';
import {
  evaluateTripStartGate,
  failedItems,
  type InspectionItemOutcome,
  type TripStartGateInput,
  type TripStartVerdict,
} from './inspection-gate';
import { findTripInspection, findValidPriorInspection } from './inspection-lookup';
import {
  INSPECTION_OVERRIDE_ENTITY_TYPE,
  OVERRIDE_REASON_MIN_LENGTH,
  TRIP_INSPECTION_ENTITY_TYPE,
} from './inspection-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TripGateContext {
  dispatchId: string;
  truckId: string;
  truckUnitNumber: string;
  primaryDriverId: string;
  driverUserId: string | null;
  status: string;
}

export interface TripGateResult {
  verdict: TripStartVerdict;
  trip: TripGateContext;
}

export type GateError = { error: string; code: string };

function isGateError(v: unknown): v is GateError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Read everything the gate needs and run it. No writes.
 *
 * Returns null when the trip does not exist in this org — callers turn that into
 * a 404 rather than leaking whether the id is real in another tenant.
 */
export async function evaluateTripGate(
  orgId: string,
  dispatchId: string,
  now: Date = new Date()
): Promise<TripGateResult | null> {
  const tenantPrisma = await getTenantPrismaForOrg(orgId);

  const trip = await tenantPrisma.trip.findFirst({
    where: { id: dispatchId, orgId, deletedAt: null },
    select: {
      id: true,
      status: true,
      truckId: true,
      primaryDriverId: true,
      inspectionRequired: true,
      inspectionOverriddenById: true,
      inspectionOverriddenReason: true,
      inspectionOverriddenAt: true,
      truck: { select: { unitNumber: true } },
      primaryDriver: { select: { userId: true } },
    },
  });
  if (!trip) return null;

  const tenant = await tenantPrisma.tenant.findUnique({
    where: { id: orgId },
    select: { requirePreTripInspection: true, blockTripStartOnFailedInspection: true },
  });

  const driverUserId = trip.primaryDriver?.userId ?? null;

  const [currentInspection, priorInspection] = await Promise.all([
    findTripInspection(orgId, dispatchId, trip.truckId),
    findValidPriorInspection({
      orgId,
      truckId: trip.truckId,
      driverUserId,
      excludeDispatchId: dispatchId,
      now,
    }),
  ]);

  const input: TripStartGateInput = {
    // A missing tenant row cannot happen behind an authenticated session, but if
    // it ever did, defaulting to "required + blocking" fails safe. The unsafe
    // default here is the permissive one.
    tenantRequiresInspection: tenant?.requirePreTripInspection ?? true,
    tenantBlocksOnFailure: tenant?.blockTripStartOnFailedInspection ?? true,
    tripInspectionRequired: trip.inspectionRequired,
    override:
      trip.inspectionOverriddenById && trip.inspectionOverriddenReason
        ? {
            byUserId: trip.inspectionOverriddenById,
            reason: trip.inspectionOverriddenReason,
            at: trip.inspectionOverriddenAt ?? now,
          }
        : null,
    currentInspection,
    priorInspection,
    now,
  };

  return {
    verdict: evaluateTripStartGate(input),
    trip: {
      dispatchId: trip.id,
      truckId: trip.truckId,
      truckUnitNumber: trip.truck?.unitNumber ?? 'Truck',
      primaryDriverId: trip.primaryDriverId,
      driverUserId,
      status: trip.status,
    },
  };
}

// ---------------------------------------------------------------------------
// Ensure an inspection exists to walk
// ---------------------------------------------------------------------------

/**
 * Return the inspection instance for this trip, creating one if the tenant has
 * no `ON_DISPATCH_CREATE` trigger configured.
 *
 * `createTrip` already fires `ON_DISPATCH_CREATE`, so on a configured tenant the
 * instance is there before the driver opens the app and this is a no-op read.
 * On an unconfigured tenant, requiring an inspection and then having nothing to
 * show the driver is the dead end item 4 forbids — so we spawn it on demand.
 */
export async function ensureTripInspection(args: {
  orgId: string;
  dispatchId: string;
  truckId: string;
  userId: string;
}): Promise<{ playbookInstanceId: string } | GateError> {
  const { orgId, dispatchId, truckId, userId } = args;

  const existing = await findTripInspection(orgId, dispatchId, truckId);
  if (existing) return { playbookInstanceId: existing.playbookInstanceId };

  const tenantPrisma = await getTenantPrismaForOrg(orgId, userId);

  const playbook = await tenantPrisma.playbook.findFirst({
    where: {
      tenantId: orgId,
      category: 'VEHICLE_INSPECTION',
      isActive: true,
      deletedAt: null,
      // SELECTION FILTER ONLY (quick-546). A VEHICLE-authored checklist is
      // still eligible to run; it just does not get to choose the instance's
      // scope. Do not narrow this to the constant — that would make eight
      // tenants' only inspection playbook ineligible and hand their drivers
      // NO_INSPECTION_CHECKLIST instead of a walkaround.
      entityType: { in: ['DISPATCH', 'VEHICLE'] },
    },
    orderBy: { createdAt: 'asc' },
    // `entityType` is deliberately NOT selected: nothing below reads it now that
    // the instance's scope comes from TRIP_INSPECTION_ENTITY_TYPE.
    select: { id: true },
  });

  if (!playbook) {
    // A real, actionable state: the tenant turned the requirement on but has no
    // inspection checklist to run. Naming it beats a generic 500, and the owner
    // can fix it in Checklists & Workflows in about a minute.
    return {
      code: 'NO_INSPECTION_CHECKLIST',
      error:
        'Pre-trip inspections are required, but no vehicle inspection checklist exists. Create one in Checklists & Workflows.',
    };
  }

  try {
    const instance = await generatePlaybookInstance({
      playbookId: playbook.id,
      // ONE INSTANCE PER TRIP — see TRIP_INSPECTION_ENTITY_TYPE in
      // `inspection-constants.ts` for why the playbook's authored entityType is
      // deliberately ignored here, and why truck scope cannot work at all under
      // generatePlaybookInstance's never-COMPLETED duplicate guard.
      entityType: TRIP_INSPECTION_ENTITY_TYPE,
      entityId: dispatchId,
      tenantId: orgId,
      triggeredBy: 'manual',
      // Header-less-safe: generatePlaybookInstance would otherwise call
      // getTenantPrisma() itself, which is the E251 path on /api/mobile/*.
      tenantPrisma,
    });
    return { playbookInstanceId: instance.id };
  } catch (err) {
    logger.error('[inspection-service] ensureTripInspection failed', err, {
      orgId,
      dispatchId,
      playbookId: playbook.id,
      error: serializeError(err),
    });
    return {
      code: 'INSPECTION_CREATE_FAILED',
      error: 'Could not open the inspection checklist. Please try again.',
    };
  }
}

// ---------------------------------------------------------------------------
// Defects
// ---------------------------------------------------------------------------

/**
 * Write one defect row per failed item, against the TRUCK.
 *
 * Upsert on `stepInstanceId` (partial unique index, NOT NULL only) so a driver
 * who corrects a note and re-submits updates their defect rather than doubling
 * the truck's open count.
 *
 * Failures here are logged and swallowed **at the call site's discretion** — see
 * `recordInspectionDefects`' caller. Losing a defect row is bad; refusing to
 * start a trip because a defect row could not be written is worse, and the
 * failure itself is on the StepInstance either way.
 */
export async function recordInspectionDefects(args: {
  orgId: string;
  dispatchId: string;
  truckId: string;
  reportedByUserId: string | null;
  failures: InspectionItemOutcome[];
}): Promise<{ written: number }> {
  const { orgId, dispatchId, truckId, reportedByUserId, failures } = args;
  if (failures.length === 0) return { written: 0 };

  const tenantPrisma = await getTenantPrismaForOrg(orgId, reportedByUserId);
  let written = 0;

  for (const failure of failures) {
    try {
      const existing = await tenantPrisma.carrierTruckDefect.findFirst({
        where: { orgId, stepInstanceId: failure.stepInstanceId },
        select: { id: true },
      });

      const data = {
        itemName: failure.name,
        note: failure.note,
        photoKeys: failure.photoKeys,
        isCritical: failure.isCritical,
        dispatchId,
      };

      if (existing) {
        await tenantPrisma.carrierTruckDefect.update({ where: { id: existing.id }, data });
      } else {
        await tenantPrisma.carrierTruckDefect.create({
          data: {
            ...data,
            orgId,
            truckId,
            stepInstanceId: failure.stepInstanceId,
            reportedByUserId,
            reportedAt: failure.completedAt ?? new Date(),
            status: 'open',
          },
        });
      }
      written++;
    } catch (err) {
      logger.error('[inspection-service] defect write failed', err, {
        orgId,
        dispatchId,
        truckId,
        stepInstanceId: failure.stepInstanceId,
        itemName: failure.name,
        error: serializeError(err),
      });
    }
  }

  return { written };
}

// ---------------------------------------------------------------------------
// Blocked → tell dispatch
// ---------------------------------------------------------------------------

/**
 * Notify the trip's dispatcher (and every owner/manager, when there is no named
 * dispatcher) that a critical inspection failure has blocked a trip.
 *
 * The driver's blocked screen states "dispatch has been told" as a fact, so this
 * must actually run before that screen claims it. It is awaited, not deferred to
 * `after()`, for exactly that reason — and because the tenant client is already
 * resolved, there is no header to lose.
 */
export async function notifyDispatchOfBlock(args: {
  orgId: string;
  dispatchId: string;
  truckUnitNumber: string;
  criticalFailures: InspectionItemOutcome[];
}): Promise<{ notified: number }> {
  const { orgId, dispatchId, truckUnitNumber, criticalFailures } = args;

  try {
    const tenantPrisma = await getTenantPrismaForOrg(orgId);

    const trip = await tenantPrisma.trip.findFirst({
      where: { id: dispatchId, orgId },
      select: { dispatcherId: true },
    });

    const recipients = new Set<string>();
    if (trip?.dispatcherId) recipients.add(trip.dispatcherId);

    if (recipients.size === 0) {
      const staff = await tenantPrisma.user.findMany({
        where: { tenantId: orgId, isActive: true, role: { in: ['OWNER', 'MANAGER'] } },
        select: { id: true },
        take: 20,
      });
      for (const s of staff) recipients.add(s.id);
    }

    const itemList = criticalFailures.map((f) => f.name).join(', ');
    const title = 'Trip blocked — inspection failed';
    const message = `Truck ${truckUnitNumber} failed a critical pre-trip item (${itemList}). The driver cannot start until this is resolved or overridden.`;

    let notified = 0;
    for (const userId of recipients) {
      try {
        await createNotification({
          orgId,
          userId,
          type: 'dispatch_assigned',
          title,
          message,
          entityType: 'dispatch',
          entityId: dispatchId,
        });
        notified++;
      } catch (err) {
        logger.error('[inspection-service] in-app block notification failed', err, {
          orgId,
          dispatchId,
          userId,
          error: serializeError(err),
        });
      }

      // Push is best-effort and genuinely deferrable — the in-app record above
      // is what makes "dispatch has been told" true.
      after(() =>
        sendPushToUser(userId, {
          title,
          body: `Truck ${truckUnitNumber}: ${itemList}`,
          data: { type: 'inspection_blocked', dispatchId },
        }).catch((err) =>
          logger.error('[inspection-service] block push failed', err, {
            orgId,
            dispatchId,
            userId,
            error: serializeError(err),
          })
        )
      );
    }

    return { notified };
  } catch (err) {
    logger.error('[inspection-service] notifyDispatchOfBlock failed', err, {
      orgId,
      dispatchId,
      error: serializeError(err),
    });
    return { notified: 0 };
  }
}

// ---------------------------------------------------------------------------
// Outcome side effects
// ---------------------------------------------------------------------------

/**
 * Apply the side effects a verdict implies, once, at the point the driver
 * submits or tries to start.
 *
 * Deliberately NOT called from `evaluateTripGate` — that is a read, and reads
 * must not write. Same separation as `ensureTemplateCommitted` / the template
 * slot view.
 */
export async function applyVerdictSideEffects(args: {
  orgId: string;
  verdict: TripStartVerdict;
  trip: TripGateContext;
  actingUserId: string | null;
}): Promise<{ defectsWritten: number; dispatchNotified: number }> {
  const { orgId, verdict, trip, actingUserId } = args;

  if (verdict.kind === 'BLOCKED') {
    const { written } = await recordInspectionDefects({
      orgId,
      dispatchId: trip.dispatchId,
      truckId: trip.truckId,
      reportedByUserId: actingUserId,
      failures: verdict.failures,
    });
    const { notified } = await notifyDispatchOfBlock({
      orgId,
      dispatchId: trip.dispatchId,
      truckUnitNumber: trip.truckUnitNumber,
      criticalFailures: verdict.criticalFailures,
    });
    // Phase 10 — Section 13 "Inspection failed": subscribers, in-app + email +
    // push.
    //
    // This runs ALONGSIDE `notifyDispatchOfBlock` above, not instead of it, and
    // the duplication is deliberate. That function addresses the trip's
    // dispatcher (or every owner/manager when there is none) unconditionally,
    // and the driver's blocked screen states "dispatch has been told" as a fact
    // — it is a GUARANTEED path backing a promise already made on screen.
    // Deleting it to avoid a second notification would quietly turn that
    // sentence into a lie for any tenant with no subscribers.
    //
    // This one is the catalogue path: subscribers only, three channels, and
    // subscribable per user like every other Section 13 trigger. A subscriber
    // who is also the named dispatcher gets both; the pair are not deduplicated
    // against each other because they are different mechanisms with different
    // guarantees, and collapsing them would mean one of the two losing its.
    await emitInspectionNotification('inspection.failed', {
      orgId,
      trip,
      failures: verdict.criticalFailures,
    });

    return { defectsWritten: written, dispatchNotified: notified };
  }

  if (verdict.kind === 'ALLOWED' && verdict.via === 'PASSED') {
    // Section 13 "Inspection passed": subscribers, in-app. No defects to list.
    const current = await findTripInspection(orgId, trip.dispatchId, trip.truckId);
    await emitInspectionNotification('inspection.passed', {
      orgId,
      trip,
      failures: [],
      itemCount: current?.items.length ?? 0,
    });
    return { defectsWritten: 0, dispatchNotified: 0 };
  }

  if (verdict.kind === 'ALLOWED' && verdict.via === 'PASSED_WITH_DEFECTS') {
    const { written } = await recordInspectionDefects({
      orgId,
      dispatchId: trip.dispatchId,
      truckId: trip.truckId,
      reportedByUserId: actingUserId,
      failures: verdict.defects,
    });

    // Section 13 "Passed with defects": subscribers, in-app + email.
    await emitInspectionNotification('inspection.passed_with_defects', {
      orgId,
      trip,
      failures: verdict.defects,
    });

    return { defectsWritten: written, dispatchNotified: 0 };
  }

  // An override granted over a failed inspection still owes the truck its
  // defects — overriding the gate does not un-break the brake line.
  if (verdict.kind === 'ALLOWED' && verdict.via === 'OWNER_OVERRIDE') {
    const current = await findTripInspection(orgId, trip.dispatchId, trip.truckId);
    if (current) {
      const { written } = await recordInspectionDefects({
        orgId,
        dispatchId: trip.dispatchId,
        truckId: trip.truckId,
        reportedByUserId: actingUserId,
        failures: failedItems(current),
      });
      return { defectsWritten: written, dispatchNotified: 0 };
    }
  }

  return { defectsWritten: 0, dispatchNotified: 0 };
}

// ---------------------------------------------------------------------------
// Phase 10 — the Section 13 inspection triggers
// ---------------------------------------------------------------------------

/**
 * Emit one of the four inspection triggers.
 *
 * All four want the same four facts — driver, truck, trip, items — because
 * Section 13 item 4 requires the notification to be actionable at a glance
 * without opening the app. Gathering them once here keeps the four call sites
 * to a single line each and keeps the wording of "which items" identical
 * across them.
 *
 * NEVER `getTenantPrisma()`: this is reached from `applyVerdictSideEffects`,
 * which is itself called from route handlers on both surfaces including
 * `/api/mobile/*`, where no `x-tenant-id` header exists. `orgId` is explicit
 * throughout, exactly as the rest of this file already insists.
 *
 * Swallows everything. A notification must never be the reason a driver cannot
 * be told their inspection outcome, and `applyVerdictSideEffects` returns counts
 * the caller renders.
 */
async function emitInspectionNotification(
  triggerKey: 'inspection.passed' | 'inspection.passed_with_defects' | 'inspection.failed',
  args: {
    orgId: string;
    trip: TripGateContext;
    failures: InspectionItemOutcome[];
    itemCount?: number;
  },
): Promise<void> {
  const { orgId, trip, failures } = args;

  try {
    const tenantPrisma = await getTenantPrismaForOrg(orgId);
    const row = await tenantPrisma.trip.findFirst({
      where: { id: trip.dispatchId, orgId },
      select: { notes: true, primaryDriver: { select: { firstName: true, lastName: true } } },
    });

    const driverName =
      [row?.primaryDriver?.firstName, row?.primaryDriver?.lastName].filter(Boolean).join(' ') ||
      'The driver';
    const tripNumber = dispatchNumberOf(row?.notes, trip.dispatchId);
    const itemNames = failures.map((f) => f.name).join(', ');
    const base = {
      tripId: trip.dispatchId,
      tripNumber,
      driverName,
      truckUnit: trip.truckUnitNumber,
    };
    const relatedEntity = { type: 'trip', id: trip.dispatchId };

    if (triggerKey === 'inspection.failed') {
      await emitNotification('inspection.failed', {
        tenantId: orgId,
        relatedEntity,
        payload: { ...base, failedCount: String(failures.length), failedItems: itemNames },
      });
      return;
    }

    if (triggerKey === 'inspection.passed_with_defects') {
      await emitNotification('inspection.passed_with_defects', {
        tenantId: orgId,
        relatedEntity,
        payload: { ...base, defectCount: String(failures.length), defectItems: itemNames },
      });
      return;
    }

    await emitNotification('inspection.passed', {
      tenantId: orgId,
      relatedEntity,
      payload: { ...base, itemCount: String(args.itemCount ?? 0) },
    });
  } catch (err) {
    // `logger.error(message, error, context)` — error SECOND. Passing the
    // context object into that slot renders `Error: [object Object]`.
    logger.error('[inspection-service] inspection notification failed', err, {
      orgId,
      triggerKey,
      dispatchId: trip.dispatchId,
      error: serializeError(err),
    });
  }
}

/**
 * The dispatch number, out of `Trip.notes`.
 *
 * There is no column for it — `createTrip` embeds `[DISPATCH_NUMBER=DC-…]` in
 * the notes string, and `trips.ts` and `carrier/notifications.ts` both read it
 * back the same way.
 */
function dispatchNumberOf(notes: string | null | undefined, tripId: string): string {
  const match = notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
  return match ? match[1] : tripId.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Owner override
// ---------------------------------------------------------------------------

/**
 * Record an owner override of the inspection gate.
 *
 * Two writes, both required by item 5:
 *  - `DispatchOverrideAudit` — the audit trail, with user, reason and timestamp.
 *    Reusing the table `createTrip`'s readiness override already writes to,
 *    with `entityType = 'INSPECTION'`. That column has NO CHECK constraint
 *    (verified against `pg_constraint`), so this is additive with no DDL.
 *  - `Trip.inspectionOverridden{ById,Reason,At}` — so it is permanently visible
 *    on the trip record itself and in any report that reads a trip, without a
 *    join every consumer would have to remember.
 *
 * Both, not either: the audit table is the history (an override can in principle
 * be granted more than once), the trip columns are the current state. Storing
 * only the audit row would mean every reader reimplements "most recent override".
 */
export async function overrideInspection(args: {
  orgId: string;
  dispatchId: string;
  userId: string;
  reason: string;
}): Promise<
  | { ok: true; override: { byUserId: string; reason: string; at: Date }; defectsWritten: number }
  | GateError
> {
  const { orgId, dispatchId, userId } = args;
  const reason = args.reason.trim();

  if (reason.length < OVERRIDE_REASON_MIN_LENGTH) {
    return {
      code: 'REASON_TOO_SHORT',
      error: `A reason of at least ${OVERRIDE_REASON_MIN_LENGTH} characters is required. This is permanently attached to the trip.`,
    };
  }

  const tenantPrisma = await getTenantPrismaForOrg(orgId, userId);

  const trip = await tenantPrisma.trip.findFirst({
    where: { id: dispatchId, orgId, deletedAt: null },
    select: { id: true, truckId: true, primaryDriverId: true },
  });
  if (!trip) return { code: 'NOT_FOUND', error: 'Trip not found' };

  const at = new Date();

  try {
    await tenantPrisma.trip.update({
      where: { id: dispatchId },
      data: {
        inspectionOverriddenById: userId,
        inspectionOverriddenReason: reason,
        inspectionOverriddenAt: at,
      },
    });

    await tenantPrisma.dispatchOverrideAudit.create({
      data: {
        tenantId: orgId,
        dispatchId,
        userId,
        reason,
        entityType: INSPECTION_OVERRIDE_ENTITY_TYPE,
        entityId: trip.truckId,
      },
    });
  } catch (err) {
    logger.error('[inspection-service] overrideInspection failed', err, {
      orgId,
      dispatchId,
      userId,
      error: serializeError(err),
    });
    return { code: 'OVERRIDE_FAILED', error: 'Could not record the override. Please try again.' };
  }

  // Defects survive the override — see applyVerdictSideEffects.
  const current = await findTripInspection(orgId, dispatchId, trip.truckId);
  const { written } = current
    ? await recordInspectionDefects({
        orgId,
        dispatchId,
        truckId: trip.truckId,
        reportedByUserId: userId,
        failures: failedItems(current),
      })
    : { written: 0 };

  // Tell the driver their block has been lifted. Best-effort: the trip screen
  // re-reads the gate on focus regardless, so a lost push is a delay, not a
  // dead end.
  const driver = await tenantPrisma.carrierDriver.findFirst({
    where: { id: trip.primaryDriverId },
    select: { userId: true },
  });
  if (driver?.userId) {
    const driverUserId = driver.userId;
    after(() =>
      sendPushToUser(driverUserId, {
        title: 'Trip cleared to start',
        body: 'Your dispatcher has overridden the inspection block. You can start the trip.',
        data: { type: 'inspection_override', dispatchId },
      }).catch((err) =>
        logger.error('[inspection-service] override push failed', err, {
          orgId,
          dispatchId,
          error: serializeError(err),
        })
      )
    );
  }

  // Phase 10 — Section 13 "Inspection overridden": subscribers, in-app + email.
  //
  // Item 4 names the required content exactly: the overriding user and the
  // reason. Both are in the first sentence of the template, and the reason is
  // carried VERBATIM rather than summarised — this is the permanent record of
  // why a truck with a failed critical item left the yard, and a paraphrase of
  // it is worth nothing to whoever reads it next.
  //
  // Emitted after the two writes above have both succeeded. Notifying about an
  // override that failed to record would be worse than not notifying at all.
  // Everything is gathered here, with `tenantPrisma` already resolved; nothing
  // downstream reads a header.
  try {
    const [overrider, tripRow] = await Promise.all([
      tenantPrisma.user.findFirst({
        where: { id: userId, tenantId: orgId },
        select: { firstName: true, lastName: true, email: true },
      }),
      tenantPrisma.trip.findFirst({
        where: { id: dispatchId, orgId },
        select: {
          notes: true,
          truck: { select: { unitNumber: true } },
          primaryDriver: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    await emitNotification('inspection.overridden', {
      tenantId: orgId,
      relatedEntity: { type: 'trip', id: dispatchId },
      payload: {
        tripId: dispatchId,
        tripNumber: dispatchNumberOf(tripRow?.notes, dispatchId),
        driverName:
          [tripRow?.primaryDriver?.firstName, tripRow?.primaryDriver?.lastName]
            .filter(Boolean)
            .join(' ') || 'The driver',
        truckUnit: tripRow?.truck?.unitNumber ?? 'Truck',
        // Falls back to the email, then to a neutral phrase — never to an empty
        // string. "overrode the block" with nobody named is the one thing this
        // notification exists to prevent.
        overriddenBy:
          [overrider?.firstName, overrider?.lastName].filter(Boolean).join(' ') ||
          overrider?.email ||
          'An owner or manager',
        reason,
        failedItems: current ? failedItems(current).map((f) => f.name).join(', ') : 'Not recorded',
      },
    });
  } catch (err) {
    logger.error('[inspection-service] override notification failed', err, {
      orgId,
      dispatchId,
      userId,
      error: serializeError(err),
    });
  }

  return { ok: true, override: { byUserId: userId, reason, at }, defectsWritten: written };
}

export { isGateError };
