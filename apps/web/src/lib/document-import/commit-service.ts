/**
 * The commit. One transaction, all of it or none of it.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER, AND WHY EACH STEP IS WHERE IT IS
 * ---------------------------------------------------------------------------
 *
 *   before the transaction   the four `ensure*` mutation boundaries, then
 *                            validation. A blocked commit must not have moved
 *                            the import's status.
 *
 *   1  external references   the facilities themselves already exist — Phase 4's
 *   2  trip                  hard rule is that T3/T4 never create one without a
 *   3  stops, end stop last  human tap, so by commit time every resolved stop
 *   4  loads                 points at a real row. What is left to write is the
 *   5  documents             `(tenant, client, code)` reference that makes
 *   6  import -> COMMITTED   tomorrow silent.
 *
 *   after the transaction    driver notification · `runPostCommitTemplateStep`
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS DELIBERATELY OUTSIDE THE ATOMIC BLOCK
 * ---------------------------------------------------------------------------
 *
 * **The driver notification.** Section 11 draws it outside and the Phase 8
 * prompt says so twice. A slow or dead push service must never roll back a
 * valid trip. It goes through `after()` from `next/server`, which is how
 * `createTrip` has always done it — the work completes even in a serverless
 * runtime whose execution context freezes once the response is delivered.
 *
 * **The template create/update step.** Section 11's diagram draws this as step
 * 7 INSIDE the transaction. It is outside, and this is a considered deviation
 * rather than an oversight:
 *
 *   - `runPostCommitTemplateStep` was written in Phase 6 with the explicit doc
 *     comment "Deliberately NOT inside the commit transaction... a template
 *     write that failed must never roll back a trip a driver is waiting on",
 *     and the Phase 8 prompt names that exact function as the thing to wire.
 *   - It is the same trade as the notification, for the same reason. Creating a
 *     route template is not part of committing a trip; it is an offer about
 *     tomorrow.
 *   - Its failures are logged with `serializeError` and swallowed, which is what
 *     makes it safe to run after the fact.
 *
 * The trip's OWN link to a template — `dispatches.route_template_id` — is
 * written inside the transaction at step 2, so nothing about the committed trip
 * depends on the post-commit step succeeding.
 *
 * ---------------------------------------------------------------------------
 * TENANT SCOPING
 * ---------------------------------------------------------------------------
 *
 * `getTenantPrismaForOrg(orgId, userId)`, not `getTenantPrisma()`. DEC-11: the
 * header-reading variant returns nothing on `/api/mobile/*` (Bearer auth means
 * no cookie, so middleware never injects `x-tenant-id`) and throws outside a
 * request entirely. Every query below also carries an explicit `orgId` filter,
 * which per DEC-11 is what tenant isolation on these tables actually rests on
 * while the connecting role still bypasses RLS. Those filters are not redundant
 * and must not be removed.
 */

import { after } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import { sendDispatchAssignedNotification } from '@/lib/carrier/notifications';
import { assertTenantKey, TenantKeyError } from '@/lib/storage/tenant-key';
import type { FacilityViewer } from '@/lib/carrier/facility-visibility';
import type { CanonicalConsignment } from '@drivecommand/validation';

import {
  committableStops,
  materialiseWindow,
  stopTypeForCommit,
  validateCommit,
  type CommitValidation,
  type DriverFacts,
  type ExistingAssignment,
  type StopGeoFacts,
  type TruckFacts,
} from './commit';
import {
  endStopCommitPlan,
  ensureEndStopCommitted,
  markEndStopMaterialised,
} from './end-stop-service';
import { ensureStopsCommitted, REFERENCE_TIER } from './facility-resolution';
import { normaliseSourceCode } from './facility-ladder';
import { getImportPages, getImportRecord, transitionImport, type ImportRecord } from './persistence';
import { ensureContractCommitted, ResolutionError } from './resolution';
import { getStopReview } from './stop-review-service';
import { reviewedConsignmentsOf, type StopReviewRow } from './stop-review';
import { runPostCommitTemplateStep } from './template-service';
import { stopProvenanceOf } from './provenance';

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export interface AssignmentInput {
  primaryDriverId: string | null;
  truckId: string | null;
  /**
   * Trailers ARE modelled: `dispatches.trailer_id` is a nullable FK to
   * `carrier_trucks`, the same table as the tractor. So the picker is a second
   * truck picker filtered to trailer-ish types, not a new entity.
   */
  trailerId?: string | null;
  coDriverId?: string | null;
  /** ISO 8601. Becomes `dispatches.scheduled_departure`. */
  scheduledDeparture: string | null;
  notes?: string | null;
}

export interface CommitPreview {
  importId: string;
  status: string;
  validation: CommitValidation;
  stopCount: number;
  endStopPolicy: string;
  endStopFacilityName: string | null;
  drivers: DriverOption[];
  trucks: TruckOption[];
  trailers: TruckOption[];
  assignment: AssignmentInput;
}

/**
 * One row of the driver picker.
 *
 * Every availability fact the dispatcher needs is on this object, because
 * Section 11's phrasing — "the driver picker shows availability inline... so no
 * second screen is needed" — is a requirement about the picker, not about a
 * detail page it can open.
 */
export interface DriverOption {
  id: string;
  name: string;
  /** "On a trip that day" · "Available". Composed server-side, one sentence. */
  availabilityLabel: string;
  assignedToday: boolean;
  /** "6h 30m left" · "No HOS log". Never a bare number. */
  hoursLabel: string;
  /** Compliance flags, already worded. Empty when the driver is clear. */
  complianceFlags: string[];
  /** True when picking this driver would BLOCK the commit. */
  blocked: boolean;
}

export interface TruckOption {
  id: string;
  unitNumber: string;
  label: string;
  status: string;
  assignedToday: boolean;
  complianceFlags: string[];
  blocked: boolean;
}

export type CommitOutcome =
  | {
      ok: true;
      tripId: string;
      stopCount: number;
      loadCount: number;
      documentCount: number;
      warnings: CommitValidation['warnings'];
    }
  | { ok: false; reason: 'BLOCKED'; validation: CommitValidation }
  | {
      ok: false;
      reason: 'FAILED';
      /** Plain language. What the dispatcher is shown. */
      message: string;
      /** Which step of Section 11's list did not survive. */
      failedStep: CommitStep;
    };

export type CommitStep =
  | 'EXTERNAL_REFS'
  | 'TRIP'
  | 'STOPS'
  | 'LOADS'
  | 'DOCUMENTS'
  | 'IMPORT_UPDATE';

/**
 * One plain sentence per step, for the dispatcher.
 *
 * Section 11: "shows the dispatcher what failed in plain language". A Prisma
 * error string is not that — it names a constraint, not a thing the dispatcher
 * can act on. The real error is logged in full beside this, never swallowed
 * into it.
 */
const STEP_MESSAGE: Record<CommitStep, string> = {
  EXTERNAL_REFS: 'Could not save the facility codes for this client. Nothing was created.',
  TRIP: 'Could not create the trip. Nothing was created.',
  STOPS: 'Could not create the stops for this trip. The trip was not created.',
  LOADS: 'Could not create the loads for this trip. The trip was not created.',
  DOCUMENTS: 'Could not attach the documents to this trip. The trip was not created.',
  IMPORT_UPDATE: 'Could not finish the import. The trip was not created.',
};

/**
 * Thrown inside the transaction so the catch outside knows which step died.
 *
 * Carries the original error rather than replacing it — no catch block in this
 * module turns an error into a bare string. DEC-11 §3 is the reason: silent
 * failure is this codebase's dominant defect mode, and `JSON.stringify(err)` is
 * `{}` because `message`/`stack`/`name` are non-enumerable.
 */
export class CommitStepError extends Error {
  readonly step: CommitStep;
  readonly cause: unknown;

  constructor(step: CommitStep, cause: unknown) {
    super(`Commit failed at step ${step}`);
    this.name = 'CommitStepError';
    this.step = step;
    this.cause = cause;
  }
}

/**
 * Test seam for the rollback integration test, and nothing else.
 *
 * The test has to force a failure at each step and prove the DATABASE is clean
 * afterwards. Making it throw for real — a bad FK, a duplicate key — would test
 * one Postgres error per step rather than the rollback, and some steps have no
 * convenient way to fail without also invalidating the input. This injects a
 * throw at a named step instead, so every step is exercised through the SAME
 * code path a real error would take: `CommitStepError` out of the transaction
 * callback, Prisma rolls back, the catch outside sets NEEDS_REVIEW.
 *
 * It is deliberately NOT a mock of the database. The queries before the
 * injected failure really run, against the real database, inside the real
 * transaction — which is exactly what makes the row-count assertions meaningful.
 */
export interface CommitOptions {
  failAtStep?: CommitStep;
}

/**
 * Run work after the response, wherever we happen to be running.
 *
 * `after()` is the right primitive inside a request — it guarantees the work
 * completes even in a serverless runtime that freezes the execution context
 * once the response is delivered, which is why `createTrip` uses it. Outside a
 * request scope (a script, a test, a cron handler) it throws, and a throw here
 * would surface as a failed commit for a trip that already exists — precisely
 * the inversion Section 11 forbids.
 *
 * So: try `after()`, and fall back to running detached. Both paths swallow and
 * log, because neither the notification nor the template step may undo a
 * committed trip.
 */
function afterResponse(label: string, importId: string, work: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (err) {
      // `logger.error(message, error, context)` — the SECOND argument is the
      // error. Passing the context there instead renders `Error: [object
      // Object]` and drops the detail entirely, which is DEC-11 §3 in a
      // different costume. `serializeError` is still used for the context copy
      // because `JSON.stringify(new Error(...))` is `{}`.
      logger.error(`[document-import] ${label} failed`, err, {
        importId,
        err: serializeError(err),
      });
    }
  };

  try {
    after(guarded);
  } catch {
    // No request scope. Run it anyway, detached — the trip is already committed
    // and this work is not allowed to affect that either way.
    void guarded();
  }
}

function tripwire(step: CommitStep, opts: CommitOptions | undefined): void {
  if (opts?.failAtStep === step) {
    throw new CommitStepError(step, new Error(`Injected failure at ${step}`));
  }
}

// ---------------------------------------------------------------------------
// Gathering the facts
// ---------------------------------------------------------------------------

const ACTIVE_TRIP_STATUSES = ['planned', 'in_progress'] as const;

/** Trips that could clash, for one driver or one truck, on the planned day. */
function assignmentsOf(
  rows: { id: string; scheduledDeparture: Date; scheduledArrival: Date | null; status: string }[],
): ExistingAssignment[] {
  return rows.map((r) => ({
    tripId: r.id,
    scheduledDeparture: r.scheduledDeparture,
    scheduledArrival: r.scheduledArrival,
    status: r.status,
  }));
}

/**
 * Minutes of driving time left, from the driver's open HOS entries.
 *
 * Null when nothing is logged, which is the common case: there is no
 * carrier-side HOS table, the entries hang off `DriverHOSEntry` keyed by the
 * linked `User`, and a carrier driver may have no linked User at all. Null
 * means "not measured" and produces a NO_HOS_DATA warning — never a zero, which
 * would be a claim about the driver's day.
 */
const DRIVING_LIMIT_MIN = 11 * 60;

async function drivingMinutesRemaining(
  db: Awaited<ReturnType<typeof getTenantPrismaForOrg>>,
  orgId: string,
  userId: string | null,
): Promise<number | null> {
  if (!userId) return null;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  try {
    const entries = await db.driverHOSEntry.findMany({
      where: { tenantId: orgId, driverId: userId, startTime: { gte: dayStart } },
      select: { status: true, startTime: true, endTime: true },
    });
    if (entries.length === 0) return null;

    let driven = 0;
    for (const e of entries) {
      if (e.status !== 'DRIVING') continue;
      const end = e.endTime ?? new Date();
      driven += Math.max(0, (end.getTime() - e.startTime.getTime()) / 60000);
    }
    return Math.max(0, Math.round(DRIVING_LIMIT_MIN - driven));
  } catch (err) {
    // Not fatal — hours are a WARNING, and a failed read must not present as
    // "zero hours left". Logged with the error's name and message, per DEC-11
    // §3: `logger.x(msg, { err })` alone stringifies to `{}`.
    logger.warn('[document-import] HOS lookup failed', {
      orgId,
      driverUserId: userId,
      err: serializeError(err),
    });
    return null;
  }
}

interface CommitContext {
  stops: StopReviewRow[];
  consignments: CanonicalConsignment[];
  driver: DriverFacts | null;
  truck: TruckFacts | null;
  scheduledDeparture: Date | null;
  endStopPolicy: string;
  endStopFacilityName: string | null;
  validation: CommitValidation;
}

async function loadCommitContext(
  orgId: string,
  userId: string,
  record: ImportRecord,
  assignment: AssignmentInput,
  viewer?: FacilityViewer | null,
): Promise<CommitContext> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  const review = await getStopReview(orgId, userId, record.id);
  const stops = committableStops(review?.stops ?? []);

  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  const parsed = assignment.scheduledDeparture ? new Date(assignment.scheduledDeparture) : null;
  const scheduledDeparture = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  // --- driver ---------------------------------------------------------------
  let driver: DriverFacts | null = null;
  if (assignment.primaryDriverId) {
    const row = await db.carrierDriver.findFirst({
      where: { id: assignment.primaryDriverId, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, cdlExpiry: true, userId: true },
    });
    if (row) {
      const [trips, user, medical] = await Promise.all([
        db.trip.findMany({
          where: {
            orgId,
            primaryDriverId: row.id,
            deletedAt: null,
            status: { in: [...ACTIVE_TRIP_STATUSES] },
          },
          select: { id: true, scheduledDeparture: true, scheduledArrival: true, status: true },
        }),
        row.userId
          ? db.user.findFirst({
              where: { id: row.userId, tenantId: orgId },
              select: { isDispatchReady: true },
            })
          : Promise.resolve(null),
        row.userId
          ? db.document.findFirst({
              where: { tenantId: orgId, driverId: row.userId, description: 'MEDICAL_CARD' },
              orderBy: { expiryDate: 'desc' },
              select: { expiryDate: true },
            })
          : Promise.resolve(null),
      ]);

      driver = {
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        cdlExpiry: row.cdlExpiry,
        medicalExpiry: medical?.expiryDate ?? null,
        isDispatchReady: user ? user.isDispatchReady : null,
        overlapping: assignmentsOf(trips),
        hoursRemainingMin: await drivingMinutesRemaining(db, orgId, row.userId),
      };
    }
  }

  // --- truck ----------------------------------------------------------------
  let truck: TruckFacts | null = null;
  if (assignment.truckId) {
    const row = await db.carrierTruck.findFirst({
      where: { id: assignment.truckId, orgId, deletedAt: null },
      select: {
        id: true,
        unitNumber: true,
        status: true,
        registrationExpiry: true,
        insuranceExpiry: true,
        payloadCapacityLbs: true,
      },
    });
    if (row) {
      const trips = await db.trip.findMany({
        where: {
          orgId,
          truckId: row.id,
          deletedAt: null,
          status: { in: [...ACTIVE_TRIP_STATUSES] },
        },
        select: { id: true, scheduledDeparture: true, scheduledArrival: true, status: true },
      });
      truck = {
        id: row.id,
        unitNumber: row.unitNumber,
        status: row.status,
        registrationExpiry: row.registrationExpiry,
        insuranceExpiry: row.insuranceExpiry,
        payloadCapacityLbs: row.payloadCapacityLbs,
        overlapping: assignmentsOf(trips),
      };
    }
  }

  // --- facility geometry, for the geography warning -------------------------
  const facilityIds = Array.from(
    new Set(stops.map((s) => s.facility?.id).filter((id): id is string => Boolean(id))),
  );
  const geoRows =
    facilityIds.length > 0
      ? await db.carrierFacility.findMany({
          where: { id: { in: facilityIds }, orgId, deletedAt: null },
          select: { id: true, state: true, latitude: true, longitude: true },
        })
      : [];
  const geo: StopGeoFacts[] = geoRows.map((f) => ({
    facilityId: f.id,
    state: f.state,
    hasCoordinates: f.latitude != null && f.longitude != null,
  }));

  // --- end stop -------------------------------------------------------------
  const plan = await endStopCommitPlan(orgId, userId, record, stops.length, viewer);
  let endStopFacilityName: string | null = null;
  if (plan.draft) {
    const f = await db.carrierFacility.findFirst({
      where: { id: plan.draft.facilityId, orgId, deletedAt: null },
      select: { name: true },
    });
    endStopFacilityName = f?.name ?? null;
  }

  const validation = validateCommit({
    driver,
    truck,
    scheduledDeparture,
    stops,
    stopBlocks: review?.blocks ?? [],
    stopWarnings: review?.warnings ?? [],
    geo,
    endStopPolicy: plan.policy,
    endStopResolved: plan.draft != null,
    now: new Date(),
  });

  return {
    stops,
    consignments,
    driver,
    truck,
    scheduledDeparture,
    endStopPolicy: plan.policy,
    endStopFacilityName,
    validation,
  };
}

// ---------------------------------------------------------------------------
// The four mutation boundaries
// ---------------------------------------------------------------------------

/**
 * Commit every slot the card showed, before the transaction opens.
 *
 * quick-508 / quick-510 / Phase 4 / Phase 7 all recorded the same defect from
 * four angles: a slot displayed from a computed default has NO record, so a
 * commit that re-derived it could reach a different answer from the card that
 * authorised it. Each of these is idempotent and returns early when the key is
 * already there.
 *
 * ORDER IS NOT ARBITRARY:
 *
 *   `ensureContractCommitted` composes `ensureClientCommitted`, so it settles
 *   the client and the contract in the right order in one call.
 *
 *   `ensureStopsCommitted` needs the client first — quick-511: the ladder
 *   context scopes its reference lookup by the EFFECTIVE client, and a null
 *   `record.clientId` makes T1 unreachable.
 *
 *   `ensureEndStopCommitted` goes LAST because the end stop's second rung is
 *   the template override, and freezing the policy before the template is
 *   settled would pin the wrong rung. It is scoped exactly like
 *   `ensureTemplateCommitted` for that reason, and is deliberately not called
 *   from the stop mutations.
 *
 * These are OUTSIDE the transaction on purpose. They are decisions the
 * dispatcher already made and already saw; they are not part of "the trip was
 * created". Rolling them back on a truck-is-out-of-service failure would
 * silently un-decide a client the dispatcher picked twenty minutes ago.
 */
async function ensureAllCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
  viewer?: FacilityViewer | null,
): Promise<ImportRecord> {
  let current = await ensureContractCommitted(orgId, userId, record);
  current = await ensureStopsCommitted(orgId, userId, current);
  current = await ensureEndStopCommitted(orgId, userId, current, viewer);
  return current;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Trailers cannot be told apart from tractors on `carrier_trucks` today.
 *
 * `dispatches.trailer_id` is a nullable FK back to `carrier_trucks`, so the
 * intent was "a trailer is a truck row with a trailer-ish `truck_type`". That
 * intent has no support in the schema. `carrier_trucks_truck_type_check` — read
 * off `pg_constraint`, per the DEC-1 / DEC-14 house rule that a column's
 * vocabulary is never inferred from the convention around it — admits exactly:
 *
 *   semi · box_truck · flatbed · reefer · tanker · day_cab · straight_truck
 *   cargo_van · sprinter_van · pickup · car
 *
 * **Every one of those is a power unit. None of them is a trailer.**
 *
 * The set this replaced held six values, and all six were wrong in one of two
 * ways:
 *
 *   - `trailer`, `dry_van`, `step_deck` — **cannot exist on this table at all.**
 *     They belong to `route_templates.equipment_type`
 *     (`dry_van|flatbed|reefer|tanker|step_deck|other`), a different column on a
 *     different table. The set was assembled from the wrong enum.
 *   - `flatbed`, `reefer`, `tanker` — real, common **tractors**, filed as
 *     trailers because the word also names a trailer body style.
 *
 * The visible cost was quick-536's Finding 1: a dispatcher could not find an
 * out-of-service truck in the Truck picker and got no explanation. The truck was
 * never filtered by `status` — the query below has no status predicate and
 * `toTruckOption` already flags `Out of service` and blocks — it was being
 * diverted into the Trailer list by its `truck_type`. The only
 * `out_of_service` row in the database is a `flatbed`, so the two facts met.
 * Every flatbed, reefer and tanker tractor in every fleet was missing from the
 * Truck picker for the same reason, out of service or not.
 *
 * So the set is empty, and stated as empty rather than deleted: the Trailer
 * section is already conditional on `trailers.length > 0`, so it simply stops
 * rendering. **This is a reported gap, not a silent removal** — `trailerId`
 * still round-trips through `AssignmentInput` and still writes
 * `dispatches.trailer_id`, and 0 of 301 dispatches have ever set it, so nothing
 * in use is lost. Giving the picker back needs a real signal that does not exist
 * yet (an `is_trailer` column, or a trailer type added to the CHECK). When one
 * arrives, this is the single place to change.
 */
export const TRAILER_TYPES = new Set<string>([]);

/**
 * `carrier_trucks_truck_type_check`, verbatim, read off `pg_constraint`.
 *
 * Here so the guardrail test can assert the one property that matters —
 * `TRAILER_TYPES` must not claim any value this column can actually hold —
 * rather than restating the list in the test and letting the two drift. If the
 * CHECK ever gains a genuine trailer value, it goes here AND in
 * `TRAILER_TYPES`, and the test holds you to doing both deliberately.
 */
export const CARRIER_TRUCK_TYPES = [
  'semi',
  'box_truck',
  'flatbed',
  'reefer',
  'tanker',
  'day_cab',
  'straight_truck',
  'cargo_van',
  'sprinter_van',
  'pickup',
  'car',
] as const;

/** The assignment screen: pickers, availability, and the live verdict. */
export async function getCommitPreview(
  orgId: string,
  userId: string,
  importId: string,
  assignment: AssignmentInput,
  viewer?: FacilityViewer | null,
): Promise<CommitPreview | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;

  const ctx = await loadCommitContext(orgId, userId, record, assignment, viewer);
  const db = await getTenantPrismaForOrg(orgId, userId);

  const day = ctx.scheduledDeparture ?? new Date();

  const [driverRows, truckRows, activeTrips] = await Promise.all([
    db.carrierDriver.findMany({
      where: { orgId, deletedAt: null, status: 'active', isSample: false },
      select: { id: true, firstName: true, lastName: true, cdlExpiry: true, userId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    db.carrierTruck.findMany({
      where: { orgId, deletedAt: null, isSample: false },
      select: {
        id: true,
        unitNumber: true,
        displayName: true,
        truckType: true,
        status: true,
        registrationExpiry: true,
        insuranceExpiry: true,
      },
      orderBy: { unitNumber: 'asc' },
    }),
    db.trip.findMany({
      where: { orgId, deletedAt: null, status: { in: [...ACTIVE_TRIP_STATUSES] } },
      select: { primaryDriverId: true, truckId: true, scheduledDeparture: true },
    }),
  ]);

  // Availability is a function of the PLANNED DAY, which is why this screen
  // re-fetches when the start time changes.
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const busyDrivers = new Set<string>();
  const busyTrucks = new Set<string>();
  for (const t of activeTrips) {
    const at = t.scheduledDeparture.getTime();
    if (at >= dayStart.getTime() && at < dayEnd.getTime()) {
      busyDrivers.add(t.primaryDriverId);
      busyTrucks.add(t.truckId);
    }
  }

  const drivers: DriverOption[] = await Promise.all(
    driverRows.map(async (d) => {
      const flags: string[] = [];
      let blocked = false;

      if (d.cdlExpiry && d.cdlExpiry.getTime() < day.getTime()) {
        flags.push('CDL expired');
        blocked = true;
      } else if (d.cdlExpiry && d.cdlExpiry.getTime() - day.getTime() < 30 * 86_400_000) {
        flags.push('CDL expiring soon');
      }

      const assignedToday = busyDrivers.has(d.id);
      if (assignedToday) blocked = true;

      const mins = await drivingMinutesRemaining(db, orgId, d.userId);

      return {
        id: d.id,
        name: `${d.firstName} ${d.lastName}`.trim(),
        availabilityLabel: assignedToday ? 'On a trip that day' : 'Available',
        assignedToday,
        hoursLabel: mins === null ? 'No HOS log' : `${Math.floor(mins / 60)}h ${mins % 60}m left`,
        complianceFlags: flags,
        blocked,
      };
    }),
  );

  const toTruckOption = (t: (typeof truckRows)[number]): TruckOption => {
    const flags: string[] = [];
    let blocked = false;
    if (t.status === 'out_of_service') {
      flags.push('Out of service');
      blocked = true;
    } else if (t.status === 'maintenance') {
      flags.push('In the shop');
      blocked = true;
    } else if (t.status === 'inactive') {
      flags.push('Inactive');
      blocked = true;
    }
    if (t.registrationExpiry && t.registrationExpiry.getTime() < day.getTime()) {
      flags.push('Registration expired');
      blocked = true;
    }
    if (t.insuranceExpiry && t.insuranceExpiry.getTime() < day.getTime()) {
      flags.push('Insurance expired');
      blocked = true;
    }
    const assignedToday = busyTrucks.has(t.id);
    if (assignedToday) blocked = true;

    return {
      id: t.id,
      unitNumber: t.unitNumber,
      label: t.displayName ? `${t.unitNumber} — ${t.displayName}` : t.unitNumber,
      status: t.status,
      assignedToday,
      complianceFlags: flags,
      blocked,
    };
  };

  return {
    importId,
    status: record.status,
    validation: ctx.validation,
    stopCount: ctx.stops.length,
    endStopPolicy: ctx.endStopPolicy,
    endStopFacilityName: ctx.endStopFacilityName,
    drivers,
    trucks: truckRows.filter((t) => !TRAILER_TYPES.has(t.truckType)).map(toTruckOption),
    trailers: truckRows.filter((t) => TRAILER_TYPES.has(t.truckType)).map(toTruckOption),
    assignment,
  };
}

// ---------------------------------------------------------------------------
// The commit
// ---------------------------------------------------------------------------

/**
 * Turn a reviewed import into a real trip. All of it, or none of it.
 *
 * Validation runs here as well as on the screen. That is the point of item 2's
 * last sentence: a direct API call with a blocked driver must still be blocked,
 * so the disabled button is a courtesy and THIS is the control.
 */
export async function commitImport(
  orgId: string,
  userId: string,
  importId: string,
  assignment: AssignmentInput,
  viewer?: FacilityViewer | null,
  opts?: CommitOptions,
): Promise<CommitOutcome> {
  const initial = await getImportRecord(orgId, importId, userId);
  if (!initial) throw new ResolutionError('That import does not exist.', 'NOT_FOUND');

  if (initial.status === 'COMMITTED') {
    throw new ResolutionError('This import has already been committed.', 'BAD_STATUS');
  }
  if (initial.status === 'CANCELLED') {
    throw new ResolutionError('This import was cancelled.', 'BAD_STATUS');
  }

  // The four mutation boundaries, before anything is validated — so the facts
  // validation reads are the same facts the transaction will write.
  const record = await ensureAllCommitted(orgId, userId, initial, viewer);

  const ctx = await loadCommitContext(orgId, userId, record, assignment, viewer);

  if (!ctx.validation.canCommit) {
    // Status untouched. A blocked commit is not an attempted commit.
    logger.info('[document-import] commit blocked', {
      importId,
      blocks: ctx.validation.blocks.map((b) => b.code),
    });
    return { ok: false, reason: 'BLOCKED', validation: ctx.validation };
  }

  // Narrowed by validation above; restated so the compiler agrees.
  const driver = ctx.driver!;
  const truck = ctx.truck!;
  const departure = ctx.scheduledDeparture!;

  if (record.status !== 'READY') {
    await transitionImport(orgId, userId, record.id, record.status, 'READY');
  }
  await transitionImport(orgId, userId, record.id, 'READY', 'COMMITTING');

  const db = await getTenantPrismaForOrg(orgId, userId);
  const pages = await getImportPages(orgId, importId, userId);
  const pageKeyByNumber = new Map<number, string>();
  for (const p of pages) {
    if (p.storageKey) pageKeyByNumber.set(p.pageNumber, p.storageKey);
  }

  const stopLinks = stopProvenanceOf(record);
  const endStopPlan = await endStopCommitPlan(orgId, userId, record, ctx.stops.length, viewer);

  let failedStep: CommitStep = 'TRIP';

  try {
    const result = await db.$transaction(
      async (tx) => {
        // ---- 1. facilities + external references --------------------------
        //
        // The FACILITY rows already exist: Phase 4's hard rule is that T3 and
        // T4 never create one without an explicit human tap, and T1/T2 link to
        // rows that were already there. What this step writes is the
        // `(tenant, client, code)` reference — the thing that makes tomorrow
        // silent — for every resolved stop that carries a source code.
        //
        // `resolved_via` holds a TIER and only a tier. DEC-14: the column's
        // CHECK admits `T1|T2|T3|T4` and nothing else, and writing the richer
        // provenance vocabulary is a 23514 on every confirmation. The map is
        // imported from `facility-resolution.ts` rather than restated.
        failedStep = 'EXTERNAL_REFS';
        tripwire('EXTERNAL_REFS', opts);

        if (record.clientId) {
          for (const row of ctx.stops) {
            const facilityId = row.facility?.id;
            const code = normaliseSourceCode(row.sourceCode);
            if (!facilityId || !code) continue;

            const link = stopLinks[String(row.index)];
            const resolvedVia = link ? REFERENCE_TIER[link.via] : 'T2';

            await tx.facilityExternalReference.upsert({
              where: {
                orgId_clientId_sourceCode: { orgId, clientId: record.clientId, sourceCode: code },
              },
              create: {
                orgId,
                clientId: record.clientId,
                sourceCode: code,
                facilityId,
                resolvedVia,
                sourceImportId: importId,
                sourceName: row.documentName || row.name,
                confirmedById: userId,
                createdById: userId,
                updatedById: userId,
              },
              update: {
                facilityId,
                resolvedVia,
                sourceName: row.documentName || row.name,
                confirmedById: userId,
                updatedById: userId,
              },
            });
          }
        }

        // ---- 2. trip ------------------------------------------------------
        failedStep = 'TRIP';
        tripwire('TRIP', opts);

        const trip = await tx.trip.create({
          data: {
            orgId,
            primaryDriverId: driver.id,
            truckId: truck.id,
            trailerId: assignment.trailerId ?? null,
            coDriverId: assignment.coDriverId ?? null,
            dispatcherId: userId,
            // The trip's own template link, written INSIDE the transaction so
            // nothing about the committed trip depends on the post-commit
            // template step succeeding.
            routeTemplateId: record.routeTemplateId ?? null,
            scheduledDeparture: departure,
            status: 'planned',
            sourceImportId: importId,
            // `dispatches_end_stop_policy_check` admits exactly the five
            // Section 9 policies plus NULL — read from pg_constraint.
            endStopPolicy: endStopPlan.policy,
            notes: assignment.notes ?? null,
            createdById: userId,
            updatedById: userId,
          },
          select: { id: true },
        });

        // ---- 3. stops in sequence, end stop last --------------------------
        failedStep = 'STOPS';
        tripwire('STOPS', opts);

        const stopIdByIndex = new Map<number, string>();

        for (let i = 0; i < ctx.stops.length; i++) {
          const row = ctx.stops[i];
          const facilityId = row.facility?.id;
          if (!facilityId) {
            // Unreachable: an unresolved facility is a stop-review BLOCK and
            // validation has already refused. Thrown rather than skipped
            // because silently dropping a consignee's freight is the worst
            // possible way to be wrong here.
            throw new CommitStepError(
              'STOPS',
              new Error(`Stop ${i + 1} has no facility at commit time`),
            );
          }

          const consignment = ctx.consignments[row.index];
          const window = consignment
            ? materialiseWindow(consignment, departure)
            : { start: null, end: null, isFirm: false };

          const created = await tx.carrierStop.create({
            data: {
              dispatchId: trip.id,
              // Array order IS the running order (Phase 5). `sequenceOrder` is
              // the position, not a sort key computed here.
              sequenceOrder: i + 1,
              stopType: stopTypeForCommit(row.stopType),
              facilityId,
              clientId: record.clientId ?? null,
              appointmentStart: window.start,
              appointmentEnd: window.end,
              appointmentIsFirm: window.isFirm,
              commodityDescription: consignment?.lineItems?.[0]?.description ?? null,
              pieces: row.rollups.pieces.value != null ? Math.round(row.rollups.pieces.value) : null,
              weightLbs:
                row.rollups.weight.value != null
                  ? new Prisma.Decimal(row.rollups.weight.value.toFixed(2))
                  : null,
              // `stops."bolRequired"` / `"podRequired"` are camelCase columns —
              // `bol_required` does not exist, unlike every snake_case
              // neighbour. Verified against information_schema, never inferred.
              bolRequired: (row.requiredDocuments ?? []).includes('BOL'),
              podRequired: (row.requiredDocuments ?? []).includes('POD'),
              contactName: row.contact?.name ?? null,
              contactPhone: row.contact?.phone ?? null,
              notes: [row.templateStandingNotes, row.notes].filter(Boolean).join('\n\n') || null,
              references: (row.references ?? []) as unknown as Prisma.InputJsonValue,
              lineItems: (row.lineItems ?? []) as unknown as Prisma.InputJsonValue,
              // The page slices. This is what lets the driver at stop five open
              // page four rather than a sixteen-page scan.
              pageNumbers: (row.pageNumbers ?? []) as unknown as Prisma.InputJsonValue,
              rollupOverridden: row.rollups.pieces.overridden || row.rollups.weight.overridden,
              createdById: userId,
              updatedById: userId,
            },
            select: { id: true },
          });

          stopIdByIndex.set(row.index, created.id);
        }

        // The end stop, pinned last by `sequenceOrder` and by
        // `@@unique([dispatchId, sequenceOrder])` — not by a sort in a renderer.
        // `stop_type` is `layover` because `stops_stop_type_check` has no value
        // meaning "return to base"; `is_end_stop` is what tells the two apart.
        if (endStopPlan.draft) {
          await tx.carrierStop.create({
            data: {
              dispatchId: trip.id,
              sequenceOrder: endStopPlan.draft.sequenceOrder,
              stopType: endStopPlan.draft.stopType,
              facilityId: endStopPlan.draft.facilityId,
              isEndStop: endStopPlan.draft.isEndStop,
              bolRequired: endStopPlan.draft.bolRequired,
              podRequired: endStopPlan.draft.podRequired,
              createdById: userId,
              updatedById: userId,
            },
          });
        }

        // ---- 4. loads -----------------------------------------------------
        failedStep = 'LOADS';
        tripwire('LOADS', opts);

        let loadCount = 0;
        if (record.clientId) {
          const totalPieces = ctx.stops.reduce((sum, s) => sum + (s.rollups.pieces.value ?? 0), 0);
          const totalWeight = ctx.stops.reduce((sum, s) => sum + (s.rollups.weight.value ?? 0), 0);

          const load = await tx.carrierLoad.create({
            data: {
              orgId,
              dispatchId: trip.id,
              clientId: record.clientId,
              contractId: record.contractId ?? null,
              // A multi-stop manifest is LTL by definition — many consignees on
              // one truck. `loads_load_type_check` admits `ltl`; read from
              // pg_constraint.
              loadType: ctx.stops.length > 1 ? 'ltl' : 'ftl',
              referenceNumber: record.documentNumber ?? null,
              commodityPieces: totalPieces > 0 ? Math.round(totalPieces) : null,
              // Money and weight as Decimal, never number. A float total is a
              // total that disagrees with the sum of its parts on the invoice.
              commodityWeightLbs:
                totalWeight > 0 ? new Prisma.Decimal(totalWeight.toFixed(2)) : null,
              status: 'assigned',
              createdById: userId,
              updatedById: userId,
            },
            select: { id: true },
          });
          loadCount = 1;

          // Point every stop at the load, so the driver's stop screen and the
          // invoice see the same freight. The end stop is excluded — it carries
          // no freight and belongs to no load.
          await tx.carrierStop.updateMany({
            where: { dispatchId: trip.id, isEndStop: false },
            data: { loadId: load.id },
          });
        }

        // ---- 5. documents -------------------------------------------------
        failedStep = 'DOCUMENTS';
        tripwire('DOCUMENTS', opts);

        let documentCount = 0;

        // Trip level: the source file, whole.
        for (const key of record.sourceFileKeys) {
          // Server-side tenant prefix check on EVERY attachment. The key came
          // from our own row, and it is still checked — a key is the one value
          // that crosses from storage into another tenant's reach, and the
          // cost of checking is nothing.
          assertTenantKey(key, orgId);
          await tx.carrierDocument.create({
            data: {
              parentType: 'dispatch',
              parentId: trip.id,
              dispatchId: trip.id,
              clientId: record.clientId ?? null,
              documentType: record.documentType ?? 'manifest',
              fileUrl: key,
              filename: record.originalName ?? 'import',
              uploadedBy: userId,
            },
          });
          documentCount++;
        }

        // Stop level: only the pages that stop appears on.
        for (const row of ctx.stops) {
          const stopId = stopIdByIndex.get(row.index);
          if (!stopId) continue;

          for (const pageNumber of row.pageNumbers ?? []) {
            const key = pageKeyByNumber.get(pageNumber);
            if (!key) continue;
            assertTenantKey(key, orgId);

            await tx.carrierDocument.create({
              data: {
                parentType: 'stop',
                parentId: stopId,
                stopId,
                dispatchId: trip.id,
                clientId: record.clientId ?? null,
                documentType: record.documentType ?? 'manifest',
                fileUrl: key,
                filename: `${record.originalName ?? 'import'} — page ${pageNumber + 1}`,
                uploadedBy: userId,
              },
            });
            documentCount++;
          }
        }

        // ---- 6. import -> COMMITTED, ids recorded -------------------------
        failedStep = 'IMPORT_UPDATE';
        tripwire('IMPORT_UPDATE', opts);

        // The end stop is now a real row. Stamped inside this transaction so
        // the flag and the `stops` row can never disagree.
        const stamped = await markEndStopMaterialised(orgId, userId, record, tx);

        await tx.documentImport.updateMany({
          where: { id: importId, orgId, deletedAt: null },
          data: {
            status: 'COMMITTED',
            createdTripId: trip.id,
            createdEntityIds: {
              tripId: trip.id,
              stopIds: Array.from(stopIdByIndex.values()),
              loadCount,
              documentCount,
            } as unknown as Prisma.InputJsonValue,
            committedAt: new Date(),
            resolutionProvenance: stamped.resolutionProvenance as unknown as Prisma.InputJsonValue,
            failureCode: null,
            failureMessage: null,
            updatedById: userId,
          },
        });

        return { tripId: trip.id, loadCount, documentCount };
      },
      // A manifest with dozens of stops writes a lot of rows. The default 5s
      // interactive-transaction budget is not enough, and a timeout here would
      // present as exactly the intermittent partial-looking failure this phase
      // exists to make impossible.
      { timeout: 30_000, maxWait: 10_000 },
    );

    logger.info('[document-import] committed', {
      importId,
      tripId: result.tripId,
      stopCount: ctx.stops.length,
      loadCount: result.loadCount,
      documentCount: result.documentCount,
    });

    // ---- 7 (post-commit). Template create / update ------------------------
    //
    // See the header: outside the transaction on purpose, per Phase 6's own
    // design. Swallowed inside the function itself, and wrapped again here so
    // a throw cannot escape into the response of a trip that already exists.
    afterResponse('post-commit template step', importId, async () => {
      await runPostCommitTemplateStep(orgId, userId, importId);
    });

    // ---- 8. driver notification, OUTSIDE the transaction ------------------
    afterResponse('driver notification', importId, async () => {
      await sendDispatchAssignedNotification(orgId, result.tripId, driver.id);
    });

    return {
      ok: true,
      tripId: result.tripId,
      stopCount: ctx.stops.length,
      loadCount: result.loadCount,
      documentCount: result.documentCount,
      warnings: ctx.validation.warnings,
    };
  } catch (err) {
    const step = err instanceof CommitStepError ? err.step : failedStep;
    const cause = err instanceof CommitStepError ? err.cause : err;

    // Never a bare string, and the error goes in the ERROR slot — passing the
    // context there instead renders `Error: [object Object]` and drops
    // everything (DEC-11 §3).
    logger.error('[document-import] commit failed — rolled back', cause, {
      importId,
      step,
      err: serializeError(cause),
    });

    const message =
      cause instanceof TenantKeyError
        ? 'A document on this import belongs to another tenant and was refused. Nothing was created.'
        : STEP_MESSAGE[step];

    // Back to NEEDS_REVIEW. `COMMITTING -> NEEDS_REVIEW` is the documented
    // rollback edge in `lifecycle.ts`, and this write is OUTSIDE the rolled-back
    // transaction, so it survives.
    try {
      await transitionImport(orgId, userId, importId, 'COMMITTING', 'NEEDS_REVIEW', {
        failureCode: `COMMIT_${step}`,
        failureMessage: message,
      });
    } catch (transitionErr) {
      logger.error(
        '[document-import] could not return import to review after a failed commit',
        transitionErr,
        { importId, err: serializeError(transitionErr) },
      );
    }

    return { ok: false, reason: 'FAILED', message, failedStep: step };
  }
}
