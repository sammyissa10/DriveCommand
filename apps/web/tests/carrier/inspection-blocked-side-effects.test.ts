/**
 * quick-549 — the BLOCKED branch's side effects, asserted against the database.
 *
 * ===========================================================================
 * THIS TEST ASSERTS ON ROWS. IT DOES NOT ASSERT ON MOCKS.
 * ===========================================================================
 *
 * Nothing here is mocked — not the Prisma client, not the gate, not the
 * handler. `handleSubmitInspection` runs for real against a real PostgreSQL
 * connection, and the assertions that matter are `count()` and `findFirst()`
 * issued after the fact against `carrier_truck_defects`. A spy on
 * `recordInspectionDefects` proves that a function was called; a row proves the
 * truck actually carries the defect, which is the only thing a driver, a
 * mechanic or a roadside inspector can act on.
 *
 * ---------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY A TEST EXISTS NOW
 * ---------------------------------------------------------------------------
 * quick-548 found `carrier_truck_defects` empty across EVERY tenant in
 * production, while FAILED `StepInstance` rows and BLOCKED inspections existed
 * in quantity. The cause was not in the write path at all: the web walkaround
 * page redirected a BLOCKED trip to `./blocked` during RENDER, so the driver
 * never reached `Review & sign`, `handleSubmitInspection` was never called, and
 * `applyVerdictSideEffects` — where all four BLOCKED side effects live — never
 * ran. A failed brake check left nothing durable behind.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS TEST WOULD FAIL IF SOMEONE SKIPPED THE BRANCH AGAIN
 * ---------------------------------------------------------------------------
 * Concretely, and in the assertion's own words:
 *
 *  - Remove or early-return the `verdict.kind === 'BLOCKED'` arm of
 *    `applyVerdictSideEffects`, and `expect(defects.total).toBe(2)` fails with
 *    "expected 0 to be 2".
 *  - Short-circuit `recordInspectionDefects` (an early `return { written: 0 }`,
 *    a swallowed throw around the whole loop, a `where` clause that never
 *    matches): same assertion, same message.
 *  - Move the side effects onto a path `handleSubmitInspection` does not take —
 *    into `handleGetGate`, into the page render, behind `handleStartTrip` only
 *    — and again the count is 0 while this test calls only submit.
 *  - Swap `verdict.failures` for `verdict.criticalFailures` in the BLOCKED arm
 *    and the count drops to 1: "expected 1 to be 2". The fixture carries one
 *    critical and one NON-critical failure precisely so those two are different
 *    numbers. A fixture with a single failure could not tell them apart.
 *
 * WHAT THIS TEST DOES NOT COVER, stated plainly rather than implied away.
 * It exercises the SERVER path and calls the handler directly. It cannot see a
 * page-level redirect, so it would still pass if someone reinstated the render-
 * time redirect in
 * `app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx` — the driver would
 * be pulled off the checklist again and this file would stay green. That half
 * is pinned by two other things: Task 1's grep (`outcome === 'BLOCKED'` must
 * return nothing in that file) and the comment block standing in the deleted
 * code's place, which states why. What this test pins is the other half, and
 * the half that was never actually broken but had no proof: that reaching
 * submit really does write the rows.
 *
 * AND IT CANNOT PASS VACUOUSLY. A second trip in the same tenant, identical in
 * every respect except that its critical item PASSED, must come back `PASSED`
 * and must leave zero defects of its own. Without that case, "a defect row
 * exists" would also be satisfied by a path that writes defects unconditionally,
 * and "the count is 2" by a stub that always returns 2.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * There is no local database (DEC-3): both env files point at the one Supabase
 * project, which is production. This follows the convention established by
 * `tests/carrier/document-import-commit-rollback.test.ts` exactly — a
 * disposable tenant, every write scoped to it, verified cleanup — and the
 * reader is referred there for the full rationale. The three guards are the
 * same: a `ZZ-THROWAWAY-...` name a human can recognise in the tenants table,
 * an `assertDisposable()` that refuses both the protected tenant by name and
 * any id that is not this suite's own, and an `afterAll` that deletes, then
 * RE-COUNTS and throws if anything survived.
 *
 * Deliberately NOT using `cleanupTestData()` from `tests/isolation/setup.ts`:
 * it deletes by broad name prefix across the whole database, unscoped by
 * tenant.
 *
 * Every enum-ish carrier column below was read off `pg_constraint` on the live
 * database before being written, per DEC-14 — `carrier_trucks.truck_type`
 * ('semi'), `carrier_trucks.status` / `carrier_drivers.status` ('active'),
 * `dispatches.status` ('planned') and `carrier_truck_defects.status`
 * ('open'). None of them is inferred from a sibling.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Load `.env.local` into `process.env`, here and only here.
 *
 * Vitest does not read `.env.local` — Next does, and the test runner is not
 * Next. Without this the suite skips silently on a machine with a perfectly
 * good DATABASE_URL in the file next to it, which is the specific way a
 * database test gets reported green while never having run.
 *
 * Copied rather than shared, for the reason the rollback test gives: a global
 * `setupFiles` loader would switch on every other DB-gated suite in the repo at
 * once, turning this change into an unrelated wave of newly-running tests.
 * Existing values always win, so CI that already exports DATABASE_URL is
 * untouched.
 */
function loadEnvLocal(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '..', '.env.local'),
    resolve(process.cwd(), '..', '..', '.env'),
  ];

  for (const file of candidates) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

/**
 * The live tenant this suite must never write to, under any circumstance.
 *
 * Named explicitly rather than relying only on "we scope everything to our own
 * id", because the two guards fail in different ways: a scoping bug is a
 * mistake in a `where` clause, and this is a tripwire that fires regardless of
 * how the id got there.
 */
const PROTECTED_TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';

/**
 * All three imports are dynamic, and all three must stay that way.
 *
 * The app's prisma singleton is CONSTRUCTED at module load and reads
 * DATABASE_URL then. Vitest hoists static imports above all file-level code, so
 * a static import would evaluate before `loadEnvLocal()` had run and pin an
 * undefined connection string.
 *
 * It is also the APP'S client rather than a fresh one: Prisma 7 here runs on a
 * driver adapter (`PrismaPg` over a `pg.Pool`), so `new PrismaClient()` with no
 * options throws PrismaClientInitializationError.
 *
 * `TRIP_INSPECTION_ENTITY_TYPE` is imported rather than restated for the reason
 * `inspection-constants.ts` gives at length: reader and writer disagreeing
 * about the instance's scope is quick-546's dead button, and a test that
 * hard-codes 'DISPATCH' would keep passing through exactly that regression.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handleSubmitInspection: any = null;
let TRIP_INSPECTION_ENTITY_TYPE = 'DISPATCH';
let INSPECTION_ITEM_STEP_TYPE = 'INSPECTION_ITEM';

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ handleSubmitInspection } = await import('@/lib/carrier/inspection-handlers'));
  ({ TRIP_INSPECTION_ENTITY_TYPE } = await import('@/lib/carrier/inspection-constants'));
  ({ INSPECTION_ITEM_STEP_TYPE } = await import('@/lib/carrier/inspection-coverage'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-QUICK549-${STAMP}`;

/** The driver's note on the critical failure. Asserted verbatim on the row. */
const CRITICAL_NOTE = 'brake leak';
/** The non-critical failure's note. Its existence is what makes 2 != 1. */
const MINOR_NOTE = 'wiper torn';

let tenantId = '';
let driverUserId = '';
let carrierDriverId = '';
let blockedTruckId = '';
let passedTruckId = '';
let blockedTripId = '';
let passedTripId = '';
let criticalStepId = '';
let minorStepId = '';

/** Refuses anything that is not this suite's own disposable tenant. */
function assertDisposable(id: string): string {
  if (id === PROTECTED_TENANT_ID) {
    throw new Error(
      `REFUSED: this test attempted to touch the protected tenant ${PROTECTED_TENANT_ID}`,
    );
  }
  if (!tenantId || id !== tenantId) {
    throw new Error(`REFUSED: expected the disposable tenant ${tenantId}, got ${id}`);
  }
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return fn(tx);
  });
}

/**
 * The `carrier_truck_defects` columns this suite asserts on.
 *
 * Written out rather than inferred because `bypass`'s callback takes an `any`
 * transaction — the same escape hatch the rollback test uses to reach models
 * through a raw-config transaction — and an `any` result would silently accept
 * a typo'd column name as `undefined`, making `expect(row.dispatchid)` pass
 * against nothing. Naming the shape puts the column names back under the
 * compiler. Every one of these is the Prisma field name, whose underlying
 * column is snake_case via `@map`.
 */
type DefectRow = {
  truckId: string;
  dispatchId: string | null;
  stepInstanceId: string | null;
  itemName: string;
  isCritical: boolean;
  note: string | null;
  status: string;
  reportedByUserId: string | null;
};

/**
 * One inspection item, as a `StepInstance` the gate will actually read.
 *
 * `stepSnapshot` carries `stepType` and `isDispatchBlocker` because that is
 * where the lookup reads them from — `buildSnapshot` filters on
 * `stepSnapshot.stepType` and `toOutcome` takes `isCritical` from
 * `stepSnapshot.isDispatchBlocker`, never from the live `PlaybookStep`. A
 * snapshot is what a running checklist means, so a later template edit cannot
 * retroactively change it.
 */
function itemStep(args: {
  instanceId: string;
  name: string;
  sequence: number;
  isDispatchBlocker: boolean;
  status: 'COMPLETE' | 'FAILED';
  note?: string;
}) {
  return {
    playbookInstanceId: args.instanceId,
    tenantId,
    // Required on StepInstance, and `resolveAssignee` returns the same thing
    // for a DRIVER-role step under either instance scope.
    assigneeRole: 'DRIVER' as const,
    stepSnapshot: {
      name: args.name,
      stepType: INSPECTION_ITEM_STEP_TYPE,
      isDispatchBlocker: args.isDispatchBlocker,
      sequence: args.sequence,
    },
    status: args.status,
    // Every item must be in a terminal state. `isInspectionComplete` requires
    // items.length > 0 AND no unanswered item, so a NOT_STARTED step here would
    // make the gate answer INSPECTION_REQUIRED and this suite would be testing
    // nothing. If a run ever reports INSPECTION_REQUIRED, the fixture is wrong,
    // not the gate.
    completedAt: new Date(),
    completedByUserId: driverUserId,
    result: args.note ? { note: args.note, photoUrls: [] } : { photoUrls: [] },
  };
}

/** Defect counts, from a fresh query, scoped to this tenant and each trip. */
async function countDefects() {
  return bypass(async (tx) => ({
    total: await tx.carrierTruckDefect.count({ where: { orgId: tenantId } }),
    blockedTrip: await tx.carrierTruckDefect.count({
      where: { orgId: tenantId, dispatchId: blockedTripId },
    }),
    passedTrip: await tx.carrierTruckDefect.count({
      where: { orgId: tenantId, dispatchId: passedTripId },
    }),
  }));
}

// ---------------------------------------------------------------------------

describeWithDb('quick-549 — a BLOCKED inspection writes its defects, asserted on rows', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-quick549-${STAMP}`,
          timezone: 'America/Chicago',
          // Both rungs the gate reads: step 1 (is an inspection required at all)
          // and step 5 (does a critical failure actually block). With either
          // off, a critical failure resolves to PASSED_WITH_DEFECTS and the
          // branch under test is never entered.
          requirePreTripInspection: true,
          blockTripStartOnFailedInspection: true,
        },
        select: { id: true },
      }),
    );
    tenantId = (tenant as { id: string }).id;

    // The tripwire, before anything is written into it.
    if (tenantId === PROTECTED_TENANT_ID) {
      throw new Error('REFUSED: the created tenant collided with the protected tenant id');
    }
    assertDisposable(tenantId);

    const seeded = await bypass(async (tx) => {
      // The acting user is the DRIVER, which is who submits a walkaround.
      // Deliberately not an OWNER or MANAGER: `notifyDispatchOfBlock` falls
      // back to every active owner/manager when a trip has no named
      // dispatcher, and this tenant having none keeps the test from sending
      // anything real. The Phase 10 `inspection.failed` catalogue emit is
      // silent for the same reason — it ships `defaultRecipients: []`, and no
      // NotificationSubscription rows are created here.
      const user = await tx.user.create({
        data: {
          tenantId: assertDisposable(tenantId),
          email: `zz-throwaway-quick549-${STAMP}@example.invalid`,
          role: 'DRIVER',
          firstName: 'ZZThrowaway',
          lastName: `Driver${STAMP}`,
        },
        select: { id: true },
      });
      driverUserId = user.id;

      const driver = await tx.carrierDriver.create({
        data: {
          orgId: tenantId,
          firstName: 'ZZThrowaway',
          lastName: `Driver${STAMP}`,
          status: 'active',
          userId: user.id,
          cdlExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      /**
       * TWO trucks, one per trip, and this is load-bearing rather than tidy.
       *
       * `findValidPriorInspection` searches by `truckId` (and by this driver),
       * and Section 12's ladder checks a prior inspection BEFORE this trip's
       * own. Sharing one truck would let the passing trip's inspection satisfy
       * the blocked trip's gate as PRIOR_INSPECTION, and the BLOCKED branch
       * would never be reached — the suite would go green having tested the
       * wrong rung entirely.
       */
      const makeTruck = (suffix: string) =>
        tx.carrierTruck.create({
          data: {
            orgId: tenantId,
            vehicleId: `ZZ-THROWAWAY-549-${suffix}-${STAMP}`,
            unitNumber: `Z${suffix}${STAMP.slice(-3)}`,
            truckType: 'semi',
            status: 'active',
            payloadCapacityLbs: 45000,
            registrationExpiry: new Date(Date.now() + 3650 * 86_400_000),
            insuranceExpiry: new Date(Date.now() + 3650 * 86_400_000),
          },
          select: { id: true },
        });
      const truckA = await makeTruck('A');
      const truckB = await makeTruck('B');

      const makeTrip = (truckId: string) =>
        tx.trip.create({
          data: {
            orgId: tenantId,
            primaryDriverId: driver.id,
            truckId,
            scheduledDeparture: new Date(Date.now() + 86_400_000),
            status: 'planned',
            // null so the TENANT setting governs — the per-trip column is an
            // override, and setting it here would skip the rung being tested.
            inspectionRequired: null,
            // Left null so step 2 (owner override) cannot short-circuit.
            inspectionOverriddenById: null,
            inspectionOverriddenReason: null,
            inspectionOverriddenAt: null,
            // No dispatcher: see the note on the user's role above.
            dispatcherId: null,
          },
          select: { id: true },
        });
      const tripA = await makeTrip(truckA.id);
      const tripB = await makeTrip(truckB.id);

      // `findTripInspection` filters on exactly this shape.
      const playbook = await tx.playbook.create({
        data: {
          tenantId,
          name: `ZZ Throwaway Pre-Trip ${STAMP}`,
          entityType: 'DISPATCH',
          category: 'VEHICLE_INSPECTION',
          deletedAt: null,
        },
        select: { id: true },
      });

      const makeInstance = (tripId: string) =>
        tx.playbookInstance.create({
          data: {
            tenantId,
            playbookId: playbook.id,
            playbookSnapshot: { name: `ZZ Throwaway Pre-Trip ${STAMP}` },
            // The constant, not the literal — and `entityId` is the TRIP id,
            // never the truck id. The starter DVIR playbook is DISPATCH-scoped
            // and this is the shape `ensureTripInspection` writes.
            entityType: TRIP_INSPECTION_ENTITY_TYPE,
            entityId: tripId,
          },
          select: { id: true },
        });
      const instanceA = await makeInstance(tripA.id);
      const instanceB = await makeInstance(tripB.id);

      return {
        driverId: driver.id,
        truckAId: truckA.id,
        truckBId: truckB.id,
        tripAId: tripA.id,
        tripBId: tripB.id,
        instanceAId: instanceA.id,
        instanceBId: instanceB.id,
      };
    });

    carrierDriverId = seeded.driverId;
    blockedTruckId = seeded.truckAId;
    passedTruckId = seeded.truckBId;
    blockedTripId = seeded.tripAId;
    passedTripId = seeded.tripBId;

    // ---- The two checklists -------------------------------------------------
    //
    // Trip A: three items — one clean pass, one CRITICAL failure, one
    // NON-critical failure. That third item is what makes this fixture able to
    // tell `verdict.failures` (all failures — what the BLOCKED arm writes) from
    // `verdict.criticalFailures` (the blocking subset). With a single failure
    // the two would be the same number and swapping them would go unnoticed.
    //
    // Trip B: the same three items with the critical one PASSING — the
    // counter-case.
    const steps = await bypass(async (tx) => {
      await tx.stepInstance.create({
        data: itemStep({
          instanceId: seeded.instanceAId,
          name: 'Lights and reflectors',
          sequence: 1,
          isDispatchBlocker: false,
          status: 'COMPLETE',
        }),
      });
      const critical = await tx.stepInstance.create({
        data: itemStep({
          instanceId: seeded.instanceAId,
          name: 'Service brakes',
          sequence: 2,
          isDispatchBlocker: true,
          status: 'FAILED',
          note: CRITICAL_NOTE,
        }),
        select: { id: true },
      });
      const minor = await tx.stepInstance.create({
        data: itemStep({
          instanceId: seeded.instanceAId,
          name: 'Windshield wipers',
          sequence: 3,
          isDispatchBlocker: false,
          status: 'FAILED',
          note: MINOR_NOTE,
        }),
        select: { id: true },
      });

      for (const [name, sequence, blocker] of [
        ['Lights and reflectors', 1, false],
        ['Service brakes', 2, true],
        ['Windshield wipers', 3, false],
      ] as const) {
        await tx.stepInstance.create({
          data: itemStep({
            instanceId: seeded.instanceBId,
            name,
            sequence,
            isDispatchBlocker: blocker,
            status: 'COMPLETE',
          }),
        });
      }

      return { criticalId: critical.id, minorId: minor.id };
    });

    criticalStepId = steps.criticalId;
    minorStepId = steps.minorId;
  }, 90_000);

  afterAll(async () => {
    if (!hasDatabase || !tenantId) return;
    assertDisposable(tenantId);

    // Children first. Every delete is keyed to this suite's own tenant.
    await bypass(async (tx) => {
      await tx.carrierTruckDefect.deleteMany({ where: { orgId: tenantId } });
      // The BLOCKED branch calls `notifyDispatchOfBlock`, which writes
      // InAppNotification rows, and `in_app_notifications.org_id` is a real FK
      // to the tenant with ON DELETE RESTRICT (read off pg_constraint). Leaving
      // them behind makes this teardown fail with a foreign-key violation AFTER
      // every assertion has already passed — exactly what bit quick-546, where
      // all the tests passed and the FILE failed. This fixture has no
      // owner/manager and no dispatcher so it should write none, but the
      // teardown does not depend on that being true.
      await tx.inAppNotification.deleteMany({ where: { orgId: tenantId } });
      // Telemetry from the Phase 10 catalogue emit. No FK to Tenant, so it
      // cannot block the delete — which is precisely why it would otherwise be
      // left behind as orphan rows in a production table.
      await tx.notificationSendLog.deleteMany({ where: { tenantId } });
      await tx.stepInstance.deleteMany({ where: { tenantId } });
      await tx.playbookInstance.deleteMany({ where: { tenantId } });
      await tx.playbook.deleteMany({ where: { tenantId } });
      await tx.trip.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierTruck.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierDriver.deleteMany({ where: { orgId: tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });

    // VERIFY the cleanup rather than assume it. A silent failure here leaves
    // orphan rows in a production database, which is a worse outcome than a
    // failing test — so this throws loudly.
    const survivors = await bypass(async (tx) => ({
      tenants: await tx.tenant.count({ where: { id: tenantId } }),
      defects: await tx.carrierTruckDefect.count({ where: { orgId: tenantId } }),
      notifications: await tx.inAppNotification.count({ where: { orgId: tenantId } }),
      sendLogs: await tx.notificationSendLog.count({ where: { tenantId } }),
      steps: await tx.stepInstance.count({ where: { tenantId } }),
      instances: await tx.playbookInstance.count({ where: { tenantId } }),
      playbooks: await tx.playbook.count({ where: { tenantId } }),
      trips: await tx.trip.count({ where: { orgId: tenantId } }),
      trucks: await tx.carrierTruck.count({ where: { orgId: tenantId } }),
      drivers: await tx.carrierDriver.count({ where: { orgId: tenantId } }),
      users: await tx.user.count({ where: { tenantId } }),
    }));

    await prisma.$disconnect();

    const leftover = Object.entries(survivors).filter(([, n]) => (n as number) > 0);
    if (leftover.length > 0) {
      throw new Error(
        `CLEANUP FAILED — orphan rows left in production for throwaway tenant ${tenantId} ` +
          `(${TENANT_NAME}): ${leftover.map(([k, n]) => `${k}=${n}`).join(', ')}`,
      );
    }
  }, 60_000);

  // -------------------------------------------------------------------------

  it('starts with no defects for this tenant', async () => {
    const before = await countDefects();
    expect(before.total).toBe(0);
    expect(before.blockedTrip).toBe(0);
    expect(before.passedTrip).toBe(0);
  });

  it('writes a defect row for EVERY failed item when the verdict is BLOCKED', async () => {
    const res = await handleSubmitInspection({
      orgId: tenantId,
      dispatchId: blockedTripId,
      userId: driverUserId,
    });

    // Pins that the fixture really did reach the branch under test. If this
    // says INSPECTION_REQUIRED the fixture left an item unanswered; if it says
    // PRIOR_INSPECTION the two trips are sharing a truck.
    expect(res.ok).toBe(true);
    expect(res.data.outcome).toBe('BLOCKED');

    // ---- THE ASSERTION THAT MATTERS. Real rows, counted after the fact. ----
    //
    // TWO, not one. The BLOCKED arm passes `verdict.failures` — every failed
    // item — to `recordInspectionDefects`, not `verdict.criticalFailures`.
    // That is correct and deliberate: overriding or resolving the blocking
    // item does not un-break the torn wiper, and a defect list that dropped
    // the non-critical failures would quietly lose them, since nothing else
    // writes that row.
    const after = await countDefects();
    expect(after.total).toBe(2);
    expect(after.blockedTrip).toBe(2);

    // And the columns, on the row that actually blocked the trip.
    const critical = await bypass<DefectRow | null>((tx) =>
      tx.carrierTruckDefect.findFirst({
        where: { orgId: tenantId, stepInstanceId: criticalStepId },
      }),
    );
    if (!critical) {
      throw new Error('no defect row was written for the critical failure');
    }
    expect(critical.truckId).toBe(blockedTruckId);
    expect(critical.dispatchId).toBe(blockedTripId);
    expect(critical.stepInstanceId).toBe(criticalStepId);
    expect(critical.itemName).toBe('Service brakes');
    expect(critical.isCritical).toBe(true);
    expect(critical.note).toBe(CRITICAL_NOTE);
    expect(critical.status).toBe('open');
    expect(critical.reportedByUserId).toBe(driverUserId);

    // The non-critical failure is a real, separate row — and it is NOT marked
    // critical, so the two are distinguishable downstream.
    const minor = await bypass<DefectRow | null>((tx) =>
      tx.carrierTruckDefect.findFirst({
        where: { orgId: tenantId, stepInstanceId: minorStepId },
      }),
    );
    if (!minor) {
      throw new Error('no defect row was written for the non-critical failure');
    }
    expect(minor.isCritical).toBe(false);
    expect(minor.note).toBe(MINOR_NOTE);
  }, 60_000);

  it('re-submitting the same failed checklist updates the defects rather than duplicating them', async () => {
    // The accepted cost of removing the render-time redirect, made executable.
    // A driver can now return to a blocked checklist and submit it again, so
    // "submit twice" is a real user path rather than a hypothetical. Defects
    // are keyed on `stepInstanceId` — matched by `recordInspectionDefects` and
    // backed by a partial unique index — so the second pass UPDATES.
    const res = await handleSubmitInspection({
      orgId: tenantId,
      dispatchId: blockedTripId,
      userId: driverUserId,
    });
    expect(res.ok).toBe(true);
    expect(res.data.outcome).toBe('BLOCKED');

    const after = await countDefects();
    expect(after.total).toBe(2);
    expect(after.blockedTrip).toBe(2);
  }, 60_000);

  // -------------------------------------------------------------------------
  // The counter-case. Without it, "two defect rows exist" would also be true of
  // a path that writes defects unconditionally, and the counts above could be
  // satisfied by a stub.
  // -------------------------------------------------------------------------

  it('writes NO defects when the same checklist passes', async () => {
    const res = await handleSubmitInspection({
      orgId: tenantId,
      dispatchId: passedTripId,
      userId: driverUserId,
    });

    expect(res.ok).toBe(true);
    expect(res.data.outcome).toBe('PASSED');

    const after = await countDefects();
    expect(after.passedTrip).toBe(0);
    // And the blocked trip's rows are untouched by an unrelated submit — the
    // total is still exactly the two written above.
    expect(after.total).toBe(2);

    // Nothing was recorded against the passing trip's truck either. Scoping the
    // count by trip alone would miss a defect written with a null dispatchId.
    const onPassedTruck = await bypass<number>((tx) =>
      tx.carrierTruckDefect.count({ where: { orgId: tenantId, truckId: passedTruckId } }),
    );
    expect(onPassedTruck).toBe(0);
  }, 60_000);

  it('kept the two trips on separate trucks, which is what makes the BLOCKED case reachable', () => {
    // Guards the fixture itself rather than the code: if someone "simplifies"
    // this to one truck, the blocked trip starts clearing at PRIOR_INSPECTION
    // and the suite would pass while testing the wrong rung. Cheap, and it
    // fails with a sentence that says what to do.
    expect(blockedTruckId).not.toBe(passedTruckId);
    expect(carrierDriverId).not.toBe('');
  });
});
