/**
 * Phase 9 — reading inspections. No writes in this file.
 *
 * Everything here exists to turn the workflow engine's shape into the shape
 * `inspection-gate.ts` can reason about. Three facts about that shape drive the
 * whole file, all three checked against production rather than assumed:
 *
 *  1. The starter Pre-Trip Inspection playbook is `entityType: 'DISPATCH'`
 *     (`seedStarterPlaybooks.createPreTripInspection`), so `entityId` is the
 *     **Trip id** — NOT the truck id. Truck and driver are reachable only by
 *     joining `dispatches`. A tenant may also build a VEHICLE-scoped inspection,
 *     so both are handled.
 *
 *  2. `PlaybookInstance.completedAt` and `startedAt` are **never written** by
 *     any service in this repo. Production: 27 instances, 0 with `completedAt`,
 *     0 with `startedAt`. The timestamp that means "when was this inspection
 *     answered" is `MAX(StepInstance.completedAt)`.
 *
 *  3. `StepStatus` is `COMPLETE`, not `COMPLETED` (`InstanceStatus` is the one
 *     with the D). Mobile's own `StepInstance` type declares `'COMPLETED'` and
 *     is wrong about the database.
 */

import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import {
  inspectionValidFrom,
  type InspectionItemOutcome,
  type InspectionSnapshot,
} from './inspection-gate';

/** `stepSnapshot`, as much of it as this module reads. */
interface StepSnapshotShape {
  name?: string;
  stepType?: string;
  isDispatchBlocker?: boolean;
}

/** `StepInstance.result` as written by `failInspectionItem`. */
interface StepResultShape {
  photoUrls?: unknown;
  note?: unknown;
}

function readPhotoKeys(result: unknown): string[] {
  const r = (result ?? {}) as StepResultShape;
  if (!Array.isArray(r.photoUrls)) return [];
  return r.photoUrls.filter((k): k is string => typeof k === 'string');
}

function readNote(result: unknown): string | null {
  const r = (result ?? {}) as StepResultShape;
  return typeof r.note === 'string' && r.note.trim() !== '' ? r.note : null;
}

/**
 * Only INSPECTION_ITEM steps are inspection outcomes.
 *
 * The starter playbook's twelfth step is a SIGNATURE, and it is `isDispatchBlocker`
 * like the rest. Counting it as an inspection item would mean an unsigned
 * checklist reads as "one item unanswered" rather than "not signed" — the same
 * verdict, but the wrong sentence on the driver's screen.
 */
const INSPECTION_ITEM = 'INSPECTION_ITEM';
const SIGNATURE = 'SIGNATURE';

type StepRow = {
  id: string;
  status: string;
  completedAt: Date | null;
  completedByUserId: string | null;
  result: unknown;
  stepSnapshot: unknown;
  assigneeRole?: string | null;
  assignedUserId?: string | null;
};

function toOutcome(step: StepRow): InspectionItemOutcome {
  const snap = (step.stepSnapshot ?? {}) as StepSnapshotShape;
  return {
    stepInstanceId: step.id,
    name: snap.name ?? 'Inspection item',
    isCritical: snap.isDispatchBlocker === true,
    status: step.status as InspectionItemOutcome['status'],
    note: readNote(step.result),
    photoKeys: readPhotoKeys(step.result),
    completedAt: step.completedAt,
  };
}

function stepType(step: StepRow): string {
  return ((step.stepSnapshot ?? {}) as StepSnapshotShape).stepType ?? '';
}

type InstanceRow = {
  id: string;
  entityType: string;
  entityId: string;
  stepInstances: StepRow[];
};

function buildSnapshot(
  instance: InstanceRow,
  truckId: string | null,
  dispatchId: string | null
): InspectionSnapshot {
  const itemSteps = instance.stepInstances.filter((s) => stepType(s) === INSPECTION_ITEM);
  const answeredTimes = instance.stepInstances
    .map((s) => s.completedAt)
    .filter((d): d is Date => d instanceof Date);

  const completedBy =
    instance.stepInstances.find((s) => s.completedByUserId)?.completedByUserId ?? null;

  return {
    playbookInstanceId: instance.id,
    dispatchId,
    truckId,
    completedByUserId: completedBy,
    items: itemSteps.map(toOutcome),
    lastAnsweredAt:
      answeredTimes.length > 0
        ? new Date(Math.max(...answeredTimes.map((d) => d.getTime())))
        : null,
  };
}

/**
 * Has the signature step been signed?
 *
 * Separate from the item outcomes for the reason above. Returns null when the
 * playbook has no signature step at all — a tenant-built inspection need not
 * have one, and "no signature step" must not read as "unsigned".
 */
export function signatureState(
  instance: InstanceRow
): { required: true; signed: boolean; stepInstanceId: string } | { required: false } {
  const sig = instance.stepInstances.find((s) => stepType(s) === SIGNATURE);
  if (!sig) return { required: false };
  return { required: true, signed: sig.status === 'COMPLETE', stepInstanceId: sig.id };
}

const STEP_SELECT = {
  id: true,
  status: true,
  completedAt: true,
  completedByUserId: true,
  result: true,
  stepSnapshot: true,
  // quick-543: the two ASSIGNMENT columns, so the driver's checklist can tell
  // which steps are actually theirs to answer.
  //
  // The COLUMNS, not `stepSnapshot.assigneeRole` — both exist and they are not
  // guaranteed to agree. `findOwnStep`, which is what actually accepts or
  // refuses the driver's tap, filters on these columns, so a screen that
  // decided from the snapshot could offer a button the server then rejects.
  // Read what the gatekeeper reads.
  assigneeRole: true,
  assignedUserId: true,
} as const;

/**
 * The inspection instance attached to THIS trip, if one has been spawned.
 *
 * `createTrip` already fires `ON_DISPATCH_CREATE`, so on a tenant with the
 * trigger configured this row exists before the driver ever opens the app. On a
 * tenant without it, this returns null and the service creates one on demand.
 */
export async function findTripInspection(
  orgId: string,
  dispatchId: string,
  truckId: string
): Promise<InspectionSnapshot | null> {
  const tenantPrisma = await getTenantPrismaForOrg(orgId);

  const instance = await tenantPrisma.playbookInstance.findFirst({
    where: {
      tenantId: orgId,
      entityType: 'DISPATCH',
      entityId: dispatchId,
      playbook: { category: 'VEHICLE_INSPECTION', deletedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      stepInstances: { where: { deletedAt: null }, select: STEP_SELECT },
    },
  });

  if (!instance) return null;
  return buildSnapshot(instance, truckId, dispatchId);
}

/**
 * The most recent completed inspection for this truck by this driver, inside the
 * validity window — Section 12's second diamond.
 *
 * Two shapes are searched because a tenant can scope its inspection playbook
 * either way:
 *
 *  - DISPATCH-scoped (what the starter seed builds): find recent trips for this
 *    truck + driver, then find inspection instances against those trip ids.
 *  - VEHICLE-scoped: `entityId` IS the truck id, and the driver is established
 *    by `StepInstance.completedByUserId`.
 *
 * The window is applied to `StepInstance.completedAt`, per fact 2 above.
 */
export async function findValidPriorInspection(args: {
  orgId: string;
  truckId: string;
  driverUserId: string | null;
  excludeDispatchId: string;
  now: Date;
}): Promise<InspectionSnapshot | null> {
  const { orgId, truckId, driverUserId, excludeDispatchId, now } = args;
  const since = inspectionValidFrom(now);
  const tenantPrisma = await getTenantPrismaForOrg(orgId);

  // Trips for this truck (and this driver, when we know who they are) that could
  // carry a DISPATCH-scoped inspection recent enough to still count.
  const candidateTrips = await tenantPrisma.trip.findMany({
    where: {
      orgId,
      truckId,
      deletedAt: null,
      id: { not: excludeDispatchId },
      updatedAt: { gte: since },
    },
    select: { id: true },
    take: 50,
  });
  const tripIds = candidateTrips.map((t) => t.id);

  const instances = await tenantPrisma.playbookInstance.findMany({
    where: {
      tenantId: orgId,
      playbook: { category: 'VEHICLE_INSPECTION', deletedAt: null },
      OR: [
        ...(tripIds.length > 0
          ? [{ entityType: 'DISPATCH' as const, entityId: { in: tripIds } }]
          : []),
        { entityType: 'VEHICLE' as const, entityId: truckId },
      ],
      stepInstances: {
        some: {
          deletedAt: null,
          status: { in: ['COMPLETE', 'FAILED', 'SKIPPED'] },
          completedAt: { gte: since },
          ...(driverUserId ? { completedByUserId: driverUserId } : {}),
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      stepInstances: { where: { deletedAt: null }, select: STEP_SELECT },
    },
  });

  // Pick the most recently answered one the gate would actually accept. The gate
  // re-checks completeness and the window itself — this is a narrowing, not a
  // second implementation of the rule.
  const snapshots = instances
    .map((i) =>
      buildSnapshot(
        i,
        truckId,
        i.entityType === 'DISPATCH' ? i.entityId : null
      )
    )
    .filter((s) => s.items.length > 0)
    .sort((a, b) => (b.lastAnsweredAt?.getTime() ?? 0) - (a.lastAnsweredAt?.getTime() ?? 0));

  return snapshots[0] ?? null;
}

/**
 * The full step list for the driver's checklist screen, in running order.
 *
 * `sequence` lives on the snapshot, not on `StepInstance`, so ordering is done
 * here rather than in the query. Falling back to `createdAt` keeps a
 * snapshot-less legacy row in a stable place instead of at a random index.
 */
export async function listInspectionSteps(orgId: string, playbookInstanceId: string) {
  const tenantPrisma = await getTenantPrismaForOrg(orgId);

  const instance = await tenantPrisma.playbookInstance.findFirst({
    where: { id: playbookInstanceId, tenantId: orgId },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      status: true,
      playbookSnapshot: true,
      stepInstances: {
        where: { deletedAt: null },
        select: { ...STEP_SELECT, createdAt: true },
      },
    },
  });
  if (!instance) return null;

  const ordered = [...instance.stepInstances].sort((a, b) => {
    const sa = (a.stepSnapshot as { sequence?: number } | null)?.sequence;
    const sb = (b.stepSnapshot as { sequence?: number } | null)?.sequence;
    if (typeof sa === 'number' && typeof sb === 'number' && sa !== sb) return sa - sb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return { instance, ordered };
}

/**
 * Open defects on a truck, newest first. Used by the owner truck detail page and
 * by the blocked screen's "what failed" list when the trip has moved on.
 */
export async function listOpenTruckDefects(orgId: string, truckId: string) {
  const tenantPrisma = await getTenantPrismaForOrg(orgId);
  try {
    return await tenantPrisma.carrierTruckDefect.findMany({
      where: { orgId, truckId, status: 'open' },
      orderBy: { reportedAt: 'desc' },
      take: 100,
    });
  } catch (err) {
    // Read-path failure must not take a page down, but it must be legible.
    // `logger.warn(msg, { err })` alone stringifies an Error to `{}` — DEC-11
    // item 3 — so the error goes through serializeError.
    logger.error('[inspection-lookup] listOpenTruckDefects failed', err, {
      orgId,
      truckId,
      error: serializeError(err),
    });
    return [];
  }
}
