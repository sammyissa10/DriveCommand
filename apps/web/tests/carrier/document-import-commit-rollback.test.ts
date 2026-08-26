/**
 * Phase 8 rollback — the integration test.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11, item 6:
 * "forces a failure at each step of the transaction and asserts against the
 * DATABASE that zero partial state remains."
 *
 * ===========================================================================
 * THIS TEST ASSERTS ON ROWS. IT DOES NOT ASSERT ON MOCKS.
 * ===========================================================================
 *
 * Nothing here is mocked — not the Prisma client, not the transaction, not the
 * commit service. `commitImport` runs for real against a real PostgreSQL
 * connection, and every assertion is a `count()` issued after the fact against
 * a real table. A spy being called proves nothing about whether Postgres rolled
 * back; a row count proves exactly that.
 *
 * The only injected thing is WHERE the failure happens — `failAtStep` makes the
 * transaction callback throw at a named point. Everything before that point is
 * a real write, inside the real transaction, which is what makes the counts
 * afterwards meaningful.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS TEST WOULD FAIL IF THE ROLLBACK WERE BROKEN
 * ---------------------------------------------------------------------------
 * Take `failAtStep: 'STOPS'`. By the time the tripwire fires, step 2 has
 * already issued `INSERT INTO dispatches`. If the rollback did not work — if
 * someone moved the trip creation outside `$transaction`, or wrapped a step in
 * a try/catch that continued, or the transaction were replaced with a plain
 * sequence of awaits — that INSERT would survive the throw and
 * `dispatches.count({ where: { orgId } })` would return 1. The assertion
 * `expect(after.trips).toBe(0)` fails with "expected 1 to be 0".
 *
 * The same holds at every step: EXTERNAL_REFS would leave a
 * `facility_external_references` row, LOADS a trip and its stops, DOCUMENTS a
 * trip, stops and a load, IMPORT_UPDATE all of it. Each step's failure has a
 * distinct set of rows it would strand, and each is counted.
 *
 * And the test cannot pass vacuously. The success case commits WITHOUT an
 * injected failure and asserts the rows DO exist — so "everything is zero"
 * cannot be achieved by a commit path that never writes anything. Without that
 * case, deleting the body of `commitImport` would make this file green.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * There is no local database (DEC-3): both env files point at the one Supabase
 * project, which is production. The repo's existing real-DB tests
 * (`tests/security/*`, `tests/isolation/setup.ts`) handle this by creating a
 * disposable tenant, scoping every write to it, and cleaning up. This follows
 * that precedent, with three additional guards:
 *
 *   1. The throwaway tenant's NAME says so — `ZZ-THROWAWAY-PHASE8-...` — as
 *      well as being a fresh UUID, so a human looking at the tenants table can
 *      tell instantly what it is and that it is safe to delete.
 *   2. `assertDisposable()` runs before every scoped write and refuses any id
 *      that is not the tenant this suite created. `PROTECTED_TENANT_ID` is
 *      checked by name on top of that, so the one tenant that must never be
 *      touched is rejected explicitly rather than only implicitly.
 *   3. Cleanup is VERIFIED. `afterAll` deletes, then re-counts, and throws if
 *      anything survived — a silent cleanup failure would leave orphans in a
 *      production database, which is worse than a red test.
 *
 * Deliberately NOT using `cleanupTestData()` from `tests/isolation/setup.ts`:
 * it deletes by broad name prefix across the whole database (`name contains
 * 'Test Tenant'`, `email contains 'test-'`), which is unscoped by tenant. Every
 * delete below is keyed to this suite's own tenant id.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AssignmentInput, CommitStep } from '@/lib/document-import/commit-service';

/**
 * Load `.env.local` into `process.env`, here and only here.
 *
 * Vitest does not read `.env.local` — Next does, and the test runner is not
 * Next. Without this the suite skips silently on a machine that has a perfectly
 * good DATABASE_URL sitting in the file next to it, which is the specific way a
 * database test gets reported green while never having run.
 *
 * Done in THIS FILE rather than in a shared `setupFiles` entry on purpose: a
 * global loader would switch on every other DB-gated suite in the repo at the
 * same time, turning a Phase 8 change into an unrelated wave of newly-running
 * tests. Existing values always win, so CI that already exports DATABASE_URL is
 * untouched.
 *
 * Hand-parsed rather than via `dotenv`: nothing may be installed, and the only
 * copy of dotenv here is a hoisted transitive dependency this package does not
 * declare.
 */
function loadEnvLocal(): void {
  // `apps/web` first, then the monorepo root — the repo keeps env in both
  // places and either may hold DATABASE_URL. First value wins, so the app-local
  // file still overrides the root one.
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
 * Both imports are dynamic, and both must stay that way.
 *
 * The app's prisma singleton is CONSTRUCTED at module load and reads
 * DATABASE_URL then. Vitest hoists static imports above all file-level code, so
 * a static import would evaluate before `loadEnvLocal()` had run and pin an
 * undefined connection string. A dynamic import is the only ordering this file
 * controls.
 *
 * It is also the APP'S client rather than a fresh one: Prisma 7 here runs on a
 * driver adapter (`PrismaPg` over a `pg.Pool`), so `new PrismaClient()` with no
 * options throws PrismaClientInitializationError — which is why
 * `tests/isolation/setup.ts`'s bare constructor has never actually run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let commitImport: any = null;

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ commitImport } = await import('@/lib/document-import/commit-service'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-PHASE8-ROLLBACK-${STAMP}`;

let tenantId = '';
let userId = '';
let clientId = '';
let driverId = '';
let importId = '';

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
 * Two consignments, at two facilities whose addresses match exactly.
 *
 * Exact normalised-address matches so the Phase 4 ladder resolves both at T2
 * and links them silently — no stored provenance to hand-craft, and the commit
 * therefore reads the same facility ids the real path would.
 *
 * Quantities are deliberately > 1 on every line item. A quantity of 1 hides a
 * missing multiplier: `2 x 500 lbs` and `1 x 500 lbs` are the same number when
 * the multiplication is dropped, so a fixture of 1 would let a rollup bug pass.
 */
const CONSIGNMENTS = [
  {
    pageNumbers: [0],
    externalCode: 'ZZTEST-43775',
    name: 'ZZ Throwaway Consignee One',
    address: {
      line1: '1200 N Mayfair Rd',
      city: 'Wauwatosa',
      state: 'WI',
      postalCode: '53226',
      country: 'US',
    },
    references: [{ type: 'PRO', value: 'ZZ-PRO-0001' }],
    totals: {},
    lineItems: [
      { sku: 'ZZ-SKU-1', description: 'Tyres', quantity: 6, uom: 'EA', weight: 480 },
      { sku: 'ZZ-SKU-2', description: 'Rims', quantity: 4, uom: 'EA', weight: 320 },
    ],
    fieldConfidence: {},
    stopType: 'delivery',
    requiredDocuments: ['POD'],
  },
  {
    pageNumbers: [1],
    externalCode: 'ZZTEST-51002',
    name: 'ZZ Throwaway Consignee Two',
    address: {
      line1: '4800 S 27th St',
      city: 'Greenfield',
      state: 'WI',
      postalCode: '53221',
      country: 'US',
    },
    references: [{ type: 'PRO', value: 'ZZ-PRO-0002' }],
    totals: {},
    lineItems: [
      { sku: 'ZZ-SKU-3', description: 'Batteries', quantity: 12, uom: 'EA', weight: 900 },
    ],
    fieldConfidence: {},
    stopType: 'delivery',
    requiredDocuments: ['POD', 'BOL'],
  },
];

const ASSIGNMENT: AssignmentInput = {
  primaryDriverId: null,
  truckId: null,
  trailerId: null,
  coDriverId: null,
  scheduledDeparture: null,
  notes: null,
};

// ---------------------------------------------------------------------------
// Row counts — every one of these is a real query against a real table
// ---------------------------------------------------------------------------

async function countRows() {
  return bypass(async (tx) => {
    const trips = await tx.trip.count({ where: { orgId: tenantId } });
    const stops = await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } });
    const loads = await tx.carrierLoad.count({ where: { orgId: tenantId } });
    const documents = await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } });
    const externalRefs = await tx.facilityExternalReference.count({ where: { orgId: tenantId } });
    const importRow = await tx.documentImport.findUnique({
      where: { id: importId },
      select: { status: true, createdTripId: true, committedAt: true, failureCode: true },
    });
    return { trips, stops, loads, documents, externalRefs, importRow };
  });
}

/**
 * Put the import back on READY, and clear the learned external references, so
 * the next step can be forced independently.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EXTERNAL REFERENCES ARE DELETED HERE
 * ---------------------------------------------------------------------------
 * `ensureStopsCommitted` — one of Phase 8's four wiring obligations — writes
 * the `(tenant, client, code)` reference rows for silently-linked stops, and it
 * runs BEFORE the transaction opens, deliberately: those are decisions the
 * dispatcher already saw, and rolling them back because a truck turned out to
 * be in the shop would silently un-learn a facility mapping.
 *
 * That means a naive "expect 0 external refs after a rollback" would fail on
 * rows that are not orphans at all. Rather than weaken the assertion to match,
 * the suite makes it mean something stronger: `ensureStopsCommitted` early-
 * returns once the stop provenance is stored (which the warm-up in `beforeAll`
 * arranges), so from then on the ONLY thing that writes a reference row is
 * step 1 INSIDE the transaction. Deleting them here and asserting zero
 * afterwards therefore proves that step 1's upsert really did roll back —
 * which is what Section 11's first box is about.
 */
async function resetImport() {
  await bypass(async (tx) => {
    await tx.documentImport.updateMany({
      where: { id: importId, orgId: assertDisposable(tenantId) },
      data: {
        status: 'READY',
        createdTripId: null,
        committedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    await tx.facilityExternalReference.deleteMany({
      where: { orgId: assertDisposable(tenantId) },
    });
  });
}

// ---------------------------------------------------------------------------

describeWithDb('Phase 8 commit — atomic rollback, asserted against the database', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-phase8-rollback-${STAMP}`,
          timezone: 'America/Chicago',
          // NONE keeps the end stop out of this fixture: it is Phase 7's
          // behaviour and has its own 65 tests. What is under test here is the
          // transaction.
          defaultEndStopPolicy: 'NONE',
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
      const user = await tx.user.create({
        data: {
          tenantId: assertDisposable(tenantId),
          // No `clerkUserId` — the Supabase Auth migration removed it from
          // `User`. `tests/isolation/setup.ts` still sets it, which is more
          // evidence those helpers have not run in a long time.
          email: `zz-throwaway-phase8-${STAMP}@example.invalid`,
          role: 'OWNER',
          isDispatchReady: true,
        },
        select: { id: true },
      });

      const client = await tx.carrierClient.create({
        data: { orgId: tenantId, name: `ZZ Throwaway Client ${STAMP}` },
        select: { id: true },
      });

      // Addresses match the consignments exactly, so the ladder links at T2.
      await tx.carrierFacility.createMany({
        data: [
          {
            orgId: tenantId,
            name: 'ZZ Throwaway Consignee One',
            facilityType: 'customer_site',
            addressLine1: '1200 N Mayfair Rd',
            city: 'Wauwatosa',
            state: 'WI',
            zip: '53226',
          },
          {
            orgId: tenantId,
            name: 'ZZ Throwaway Consignee Two',
            facilityType: 'customer_site',
            addressLine1: '4800 S 27th St',
            city: 'Greenfield',
            state: 'WI',
            zip: '53221',
          },
        ],
      });

      const driver = await tx.carrierDriver.create({
        data: {
          orgId: tenantId,
          firstName: 'ZZThrowaway',
          lastName: `Driver${STAMP}`,
          status: 'active',
          userId: user.id,
          // Valid for a decade — this suite is about the transaction, and the
          // compliance blocks have their own case at the end.
          cdlExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      const truck = await tx.carrierTruck.create({
        data: {
          orgId: tenantId,
          vehicleId: `ZZ-THROWAWAY-${STAMP}`,
          unitNumber: `ZZ${STAMP.slice(-4)}`,
          truckType: 'semi',
          status: 'active',
          payloadCapacityLbs: 45000,
          registrationExpiry: new Date(Date.now() + 3650 * 86_400_000),
          insuranceExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      const imp = await tx.documentImport.create({
        data: {
          orgId: tenantId,
          status: 'READY',
          sourceFileKeys: [`tenant-${tenantId}/imports/zz-throwaway-${STAMP}.jpg`],
          sourceMimeType: 'image/jpeg',
          originalName: `zz-throwaway-${STAMP}.jpg`,
          contentHash: `zzthrowaway${STAMP}`,
          documentNumber: `ZZ-DOC-${STAMP}`,
          documentType: 'MANIFEST',
          clientId: client.id,
          pageCount: 2,
          reviewedExtraction: {
            documentType: 'MANIFEST',
            header: { documentNumber: `ZZ-DOC-${STAMP}` },
            consignments: CONSIGNMENTS,
            extractionWarnings: [],
          },
          createdById: user.id,
        },
        select: { id: true },
      });

      // Per-page rows, so the per-stop page slices have storage keys to attach.
      await tx.documentImportPage.createMany({
        data: [0, 1].map((n) => ({
          orgId: tenantId,
          importId: imp.id,
          pageNumber: n,
          pageHash: `zzpage${STAMP}-${n}`,
          storageKey: `tenant-${tenantId}/imports/zz-throwaway-${STAMP}-p${n}.png`,
        })),
      });

      return {
        userId: user.id,
        clientId: client.id,
        driverId: driver.id,
        truckId: truck.id,
        importId: imp.id,
      };
    });

    userId = seeded.userId;
    clientId = seeded.clientId;
    driverId = seeded.driverId;
    importId = seeded.importId;

    ASSIGNMENT.primaryDriverId = driverId;
    ASSIGNMENT.truckId = seeded.truckId;
    ASSIGNMENT.scheduledDeparture = new Date(Date.now() + 86_400_000).toISOString();

    // ---- Warm-up: settle the four pre-transaction mutation boundaries -----
    //
    // A commit with no driver is refused at validation and NEVER opens the
    // transaction — but `ensureAllCommitted` has already run by then, which is
    // exactly what is wanted: the client, the stop links and the end-stop
    // policy are now recorded, so `ensureStopsCommitted` early-returns on every
    // later call and stops writing reference rows outside the transaction.
    //
    // Done through the public API rather than by hand, so the warm-up cannot
    // drift from what a real commit does.
    const warmUp = await commitImport(
      tenantId,
      userId,
      importId,
      { ...ASSIGNMENT, primaryDriverId: null, truckId: null },
      null,
    );
    if (warmUp.ok || warmUp.reason !== 'BLOCKED') {
      throw new Error(`warm-up should have been BLOCKED, got ${JSON.stringify(warmUp)}`);
    }
  }, 90_000);

  afterAll(async () => {
    if (!hasDatabase || !tenantId) return;
    assertDisposable(tenantId);

    // Children first. Every delete is keyed to this suite's own tenant.
    await bypass(async (tx) => {
      await tx.carrierDocument.deleteMany({ where: { dispatch: { orgId: tenantId } } });
      await tx.carrierStop.deleteMany({ where: { dispatch: { orgId: tenantId } } });
      await tx.carrierLoad.deleteMany({ where: { orgId: tenantId } });
      await tx.trip.deleteMany({ where: { orgId: tenantId } });
      await tx.facilityExternalReference.deleteMany({ where: { orgId: tenantId } });
      await tx.documentImportPage.deleteMany({ where: { orgId: tenantId } });
      await tx.documentImport.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierFacility.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierTruck.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierDriver.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierContract.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierClient.deleteMany({ where: { orgId: tenantId } });
      await tx.routeTemplate.deleteMany({ where: { orgId: tenantId } });
      // Phase 10: the commit now emits import.needs_review / trip.assigned,
      // which write InAppNotification rows. `in_app_notifications.org_id` is a
      // real FK to the tenant, so leaving them behind makes this teardown fail
      // with a foreign-key violation AFTER every assertion has already passed.
      // The tests were not wrong; the cleanup list simply predates the table
      // ever having rows in these fixtures.
      // quick-551: `NotificationLog.tenantId` is a RESTRICT foreign key to Tenant,
      // exactly like `in_app_notifications.org_id` below it, and it was NOT in this
      // list. Rows landed here from the same Phase 10 emits. Omitting it re-creates
      // the failure the line below was added to fix — every assertion passes and the
      // FILE fails afterwards on a foreign-key violation, leaving an orphan tenant
      // in production. (`TenantNotificationSettings` is CASCADE and correctly absent.)
      await tx.notificationLog.deleteMany({ where: { tenantId } });
      await tx.inAppNotification.deleteMany({ where: { orgId: tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });

    // VERIFY the cleanup rather than assume it. A silent failure here leaves
    // orphan rows in a production database, which is a worse outcome than a
    // failing test — so this throws loudly.
    const survivors = await bypass(async (tx) => ({
      tenants: await tx.tenant.count({ where: { id: tenantId } }),
      trips: await tx.trip.count({ where: { orgId: tenantId } }),
      stops: await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } }),
      loads: await tx.carrierLoad.count({ where: { orgId: tenantId } }),
      documents: await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } }),
      imports: await tx.documentImport.count({ where: { orgId: tenantId } }),
      facilities: await tx.carrierFacility.count({ where: { orgId: tenantId } }),
      drivers: await tx.carrierDriver.count({ where: { orgId: tenantId } }),
      trucks: await tx.carrierTruck.count({ where: { orgId: tenantId } }),
      users: await tx.user.count({ where: { tenantId } }),
      notificationLogs: await tx.notificationLog.count({ where: { tenantId } }),
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

  it('starts from a clean database for this tenant', async () => {
    const before = await countRows();
    expect(before.trips).toBe(0);
    expect(before.stops).toBe(0);
    expect(before.loads).toBe(0);
    expect(before.documents).toBe(0);
    expect(before.importRow.status).toBe('READY');
  });

  const STEPS: CommitStep[] = [
    'EXTERNAL_REFS',
    'TRIP',
    'STOPS',
    'LOADS',
    'DOCUMENTS',
    'IMPORT_UPDATE',
  ];

  for (const step of STEPS) {
    it(`rolls back completely when the transaction fails at ${step}`, async () => {
      await resetImport();

      const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null, {
        failAtStep: step,
      });

      // The service reports the failure honestly rather than pretending.
      expect(outcome.ok).toBe(false);
      if (!outcome.ok && outcome.reason === 'FAILED') {
        expect(outcome.failedStep).toBe(step);
        expect(outcome.message.length).toBeGreaterThan(0);
      } else {
        throw new Error(`expected a FAILED outcome at ${step}, got ${JSON.stringify(outcome)}`);
      }

      // ---- THE ASSERTIONS THAT MATTER. Real rows, counted after the fact. ----
      const after = await countRows();
      expect(after.trips).toBe(0);
      expect(after.stops).toBe(0);
      expect(after.loads).toBe(0);
      expect(after.documents).toBe(0);
      expect(after.externalRefs).toBe(0);

      // And the import is back in review, with the trip link never set.
      expect(after.importRow.status).toBe('NEEDS_REVIEW');
      expect(after.importRow.createdTripId).toBeNull();
      expect(after.importRow.committedAt).toBeNull();
      expect(after.importRow.failureCode).toBe(`COMMIT_${step}`);
    }, 60_000);
  }

  // -------------------------------------------------------------------------
  // The control. Without this, "everything is zero" would also be true of a
  // commit path that never writes anything at all.
  // -------------------------------------------------------------------------

  it('writes the trip, its stops, its load and its documents when nothing fails', async () => {
    await resetImport();

    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
    if (!outcome.ok) {
      throw new Error(`expected a successful commit, got ${JSON.stringify(outcome)}`);
    }

    const after = await countRows();
    expect(after.trips).toBe(1);
    // Two consignments, end stop policy NONE — so exactly two stops.
    expect(after.stops).toBe(2);
    expect(after.loads).toBe(1);
    // One trip-level source file + one page slice per stop.
    expect(after.documents).toBe(3);
    // Both consignments carry an external code, so both are learned.
    expect(after.externalRefs).toBe(2);

    expect(after.importRow.status).toBe('COMMITTED');
    expect(after.importRow.createdTripId).toBe(outcome.tripId);
    expect(after.importRow.committedAt).not.toBeNull();

    // The stops are in the document's order, and the page slice attached to
    // stop 2 is page 2 — not the whole scan. This is item 4's guarantee, read
    // back off the database rather than asserted about the input.
    const detail = await bypass(async (tx) => {
      const stops = await tx.carrierStop.findMany({
        where: { dispatchId: outcome.tripId },
        orderBy: { sequenceOrder: 'asc' },
        select: {
          sequenceOrder: true,
          stopType: true,
          pageNumbers: true,
          podRequired: true,
          bolRequired: true,
          pieces: true,
          weightLbs: true,
          isEndStop: true,
        },
      });
      const stopDocs = await tx.carrierDocument.findMany({
        where: { parentType: 'stop', dispatchId: outcome.tripId },
        select: { stopId: true, fileUrl: true },
      });
      const load = await tx.carrierLoad.findFirst({
        where: { orgId: tenantId },
        select: { loadType: true, commodityPieces: true, commodityWeightLbs: true, clientId: true },
      });
      return { stops, stopDocs, load };
    });

    expect(detail.stops.map((s: { sequenceOrder: number }) => s.sequenceOrder)).toEqual([1, 2]);
    expect(detail.stops[0].pageNumbers).toEqual([0]);
    expect(detail.stops[1].pageNumbers).toEqual([1]);
    expect(detail.stops.every((s: { isEndStop: boolean }) => s.isEndStop === false)).toBe(true);

    // Stop 1 asked for POD only; stop 2 asked for both. The camelCase columns
    // (`"bolRequired"` / `"podRequired"`) really do carry it.
    expect(detail.stops[0].podRequired).toBe(true);
    expect(detail.stops[0].bolRequired).toBe(false);
    expect(detail.stops[1].bolRequired).toBe(true);

    // Rollups: 6 + 4 = 10 pieces and 480 + 320 = 800 lbs at stop 1.
    // Every fixture quantity is > 1 on purpose — a quantity of 1 would let a
    // dropped multiplier pass unnoticed.
    expect(detail.stops[0].pieces).toBe(10);
    expect(Number(detail.stops[0].weightLbs)).toBe(800);
    expect(detail.stops[1].pieces).toBe(12);
    expect(Number(detail.stops[1].weightLbs)).toBe(900);

    // Two stops on one truck is LTL, and the load's totals are the sum.
    expect(detail.load.loadType).toBe('ltl');
    expect(detail.load.commodityPieces).toBe(22);
    expect(Number(detail.load.commodityWeightLbs)).toBe(1700);
    expect(detail.load.clientId).toBe(clientId);

    // Each stop document points at ITS page, not at the source scan.
    expect(detail.stopDocs).toHaveLength(2);
    for (const doc of detail.stopDocs) {
      expect(doc.fileUrl).toContain(`tenant-${tenantId}/`);
      expect(doc.fileUrl).toMatch(/-p[01]\.png$/);
    }
  }, 90_000);

  it('refuses a direct call that names a driver with an expired licence', async () => {
    // The success case above left the import COMMITTED, which is terminal.
    // Forced back to READY with a raw write — the point of this case is the
    // compliance gate, not the lifecycle.
    await resetImport();

    // The UI's disabled button is a courtesy; THIS is the control. Straight
    // into the service, no screen involved.
    await bypass((tx) =>
      tx.carrierDriver.updateMany({
        where: { id: driverId, orgId: assertDisposable(tenantId) },
        data: { cdlExpiry: new Date(Date.now() - 30 * 86_400_000) },
      }),
    );

    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.reason === 'BLOCKED') {
      expect(outcome.validation.blocks.some((b: { code: string }) => b.code === 'LICENCE_EXPIRED')).toBe(
        true,
      );

      // The trip committed by the previous case is still on the books, so the
      // OVERLAP block fires too — against real rows, which is a better proof of
      // that rule than any fixture. It sorts ahead of the compliance blocks in
      // `blockedReason` by design: "already on a trip that day" is the more
      // actionable sentence to put under a disabled button.
      expect(outcome.validation.blocks.some((b: { code: string }) => b.code === 'DRIVER_OVERLAP')).toBe(
        true,
      );

      // Whatever comes first, the reason is NAMED and never generic.
      expect(outcome.validation.blockedReason).toBe(outcome.validation.blocks[0].message);
      expect(outcome.validation.blockedReason).toMatch(/ZZThrowaway/);
    } else {
      throw new Error(`expected a BLOCKED outcome, got ${JSON.stringify(outcome)}`);
    }

    // Now clear the overlap and re-run, so the licence block is the one left
    // standing and its sentence can be read on its own.
    await bypass((tx) => tx.carrierDocument.deleteMany({ where: { dispatch: { orgId: tenantId } } }));
    await bypass((tx) => tx.carrierStop.deleteMany({ where: { dispatch: { orgId: tenantId } } }));
    await bypass((tx) => tx.carrierLoad.deleteMany({ where: { orgId: assertDisposable(tenantId) } }));
    await bypass((tx) => tx.trip.deleteMany({ where: { orgId: assertDisposable(tenantId) } }));
    await resetImport();

    const licenceOnly = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
    if (licenceOnly.ok || licenceOnly.reason !== 'BLOCKED') {
      throw new Error(`expected a BLOCKED outcome, got ${JSON.stringify(licenceOnly)}`);
    }
    expect(licenceOnly.validation.blockedReason).toMatch(/CDL expired/);
    expect(licenceOnly.validation.canCommit).toBe(false);

    // No new trip, and a REFUSED commit does not move the import's status — it
    // was put back on READY above and is still READY. A blocked commit is not
    // an attempted commit.
    const after = await countRows();
    expect(after.trips).toBe(0);
    expect(after.importRow.status).toBe('READY');
  }, 90_000);
});
