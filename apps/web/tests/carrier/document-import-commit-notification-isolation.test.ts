/**
 * Phase 8 verify check 5 — a failing driver notification cannot undo a
 * committed trip. quick-536, Part B.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11 draws the
 * driver notification OUTSIDE the transaction. `commit-service.ts` puts it
 * behind `afterResponse()`, which prefers `after()` from `next/server` and
 * falls back to running detached when there is no request scope.
 *
 * ===========================================================================
 * THIS TEST ASSERTS ON ROWS. THE MOCK IS THE INJECTION, NOT THE EVIDENCE.
 * ===========================================================================
 *
 * The one mocked thing is `emitNotificationAfterResponse` (Phase 10; it was
 * `sendDispatchAssignedNotification` until the commit stopped calling that),
 * replaced with a
 * function that rejects. That is how the failure is FORCED — the same role
 * `failAtStep` plays in the rollback suite. Every assertion that decides
 * whether this test passes is a `count()` or a `findMany()` issued against a
 * real PostgreSQL table after the commit has returned.
 *
 * Asserting "the mock was called" would prove nothing: a spy firing says the
 * call site exists, not that Postgres kept the trip. A row count says exactly
 * that.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WOULD FAIL IF THE NOTIFICATION WERE INSIDE THE TRANSACTION
 * ---------------------------------------------------------------------------
 * If the emit were awaited inside the `$transaction`
 * callback — or awaited after it without a guard, or if `afterResponse`'s
 * fallback rethrew instead of swallowing — the rejection would propagate into
 * `commitImport`'s catch. That catch rolls the import back to NEEDS_REVIEW and
 * returns `{ ok: false, reason: 'FAILED' }`, and Postgres would have discarded
 * every write. `expect(outcome.ok).toBe(true)` fails with "expected false to be
 * true", and behind it `expect(after.trips).toBe(1)` fails with "expected +0 to
 * be 1", `after.stops` with "expected +0 to be 2", `after.documents` with
 * "expected +0 to be 3". A driver's trip deleted because a push service was
 * down is precisely the inversion Section 11 forbids, and each of those four
 * messages names it.
 *
 * And it cannot pass vacuously. The second case runs the identical commit with
 * the notification NOT throwing and asserts the same rows — so "the trip
 * survives a failing notification" cannot be satisfied by a commit path that
 * writes nothing, nor by a notification that was never wired up at all. The two
 * cases assert identical counts, so any difference between them is the
 * notification's doing and nothing else's.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * Same discipline as `document-import-commit-rollback.test.ts` and for the same
 * reason (DEC-3: there is no local database, both env files point at the one
 * Supabase project, which is production):
 *
 *   1. A throwaway tenant whose NAME says so — `ZZ-THROWAWAY-PHASE8-NOTIF-…`.
 *   2. `assertDisposable()` before every scoped write, plus an explicit
 *      by-name refusal of `PROTECTED_TENANT_ID`.
 *   3. `afterAll` deletes, then RE-COUNTS, and throws if anything survived.
 *   4. The whole suite skips when `DATABASE_URL` is unset.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AssignmentInput } from '@/lib/document-import/commit-service';

/**
 * The forced failure.
 *
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every file-level
 * statement — a plain `const` declared here would still be in its temporal dead
 * zone when the factory runs.
 */
const notif = vi.hoisted(() => ({
  shouldThrow: true,
  calls: 0,
  lastErrorName: null as string | null,
}));

/**
 * PHASE 10 RETARGETED THIS MOCK, and the property under test is unchanged.
 *
 * The commit used to notify via `sendDispatchAssignedNotification`. That
 * function opens with `await getTenantPrisma()`, which reads the `x-tenant-id`
 * header — and it was being called from inside `after()`, where the response is
 * gone and `headers()` throws E251. It had therefore been failing on every real
 * commit since Phase 8 shipped, swallowed by the guard this very test exists to
 * verify. Phase 10 replaced the call site with
 * `emitNotificationAfterResponse('trip.assigned', …)`.
 *
 * So the injection point moves and NOTHING ELSE DOES. Every assertion below is
 * still a `count()` against a real PostgreSQL table, and the question is still
 * "can a failing notification undo a committed trip". Had the mock been left
 * pointing at the old function, this suite would have gone green forever while
 * testing a code path the commit no longer takes — a test passing because it
 * asserts on nothing.
 *
 * The throw is SYNCHRONOUS on purpose. `emitNotificationAfterResponse` returns
 * `void` rather than a promise, so a synchronous throw is the only failure mode
 * that could actually escape into `commitImport`'s try block. It is the
 * strongest form of the injection available at this call site.
 */
vi.mock('@/lib/notifications/emit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/emit')>();
  return {
    ...actual,
    emitNotificationAfterResponse: (triggerKey: string) => {
      // Only the commit's own driver notification. `transitionImport` also emits
      // through this module now (import.needs_review), and forcing THAT to throw
      // would be testing a different call site than the one this file is about.
      if (triggerKey !== 'trip.assigned') return;
      notif.calls += 1;
      if (notif.shouldThrow) {
        // A named, distinctive error — so if it ever DID escape into the
        // commit's response, the failure message would say where it came from
        // rather than looking like a database problem.
        const err = new Error('ZZ-FORCED: push service unreachable');
        err.name = 'ForcedNotificationFailure';
        notif.lastErrorName = err.name;
        throw err;
      }
    },
  };
});

/** See the rollback suite: vitest does not read `.env.local`; Next does. */
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

const PROTECTED_TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';

// Dynamic, and must stay so — the prisma singleton reads DATABASE_URL at module
// load, and vitest hoists static imports above `loadEnvLocal()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let commitImport: any = null;

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ commitImport } = await import('@/lib/document-import/commit-service'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-PHASE8-NOTIF-${STAMP}`;

let tenantId = '';
let userId = '';
let importId = '';

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

const CONSIGNMENTS = [
  {
    pageNumbers: [0],
    externalCode: 'ZZNOTIF-1',
    name: 'ZZ Notif Consignee One',
    address: {
      line1: '1200 N Mayfair Rd',
      city: 'Wauwatosa',
      state: 'WI',
      postalCode: '53226',
      country: 'US',
    },
    references: [{ type: 'PRO', value: 'ZZ-NOTIF-0001' }],
    totals: {},
    lineItems: [{ sku: 'ZZ-N-1', description: 'Tyres', quantity: 6, uom: 'EA', weight: 480 }],
    fieldConfidence: {},
    stopType: 'delivery',
    requiredDocuments: ['POD'],
  },
  {
    pageNumbers: [1],
    externalCode: 'ZZNOTIF-2',
    name: 'ZZ Notif Consignee Two',
    address: {
      line1: '4800 S 27th St',
      city: 'Greenfield',
      state: 'WI',
      postalCode: '53221',
      country: 'US',
    },
    references: [{ type: 'PRO', value: 'ZZ-NOTIF-0002' }],
    totals: {},
    lineItems: [{ sku: 'ZZ-N-2', description: 'Batteries', quantity: 12, uom: 'EA', weight: 900 }],
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

async function countRows() {
  return bypass(async (tx) => ({
    trips: await tx.trip.count({ where: { orgId: tenantId } }),
    stops: await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } }),
    loads: await tx.carrierLoad.count({ where: { orgId: tenantId } }),
    documents: await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } }),
    importRow: await tx.documentImport.findUnique({
      where: { id: importId },
      select: { status: true, createdTripId: true, committedAt: true, failureCode: true },
    }),
  }));
}

/**
 * Back to READY, and clear out everything the previous case committed.
 *
 * Both cases assert the SAME counts, which is what makes them comparable — so
 * each starts from an empty tenant rather than from whatever the last one left.
 */
async function resetAll() {
  await bypass(async (tx) => {
    await tx.carrierDocument.deleteMany({
      where: { dispatch: { orgId: assertDisposable(tenantId) } },
    });
    await tx.carrierStop.deleteMany({ where: { dispatch: { orgId: tenantId } } });
    await tx.carrierLoad.deleteMany({ where: { orgId: tenantId } });
    await tx.trip.deleteMany({ where: { orgId: tenantId } });
    await tx.documentImport.updateMany({
      where: { id: importId, orgId: tenantId },
      data: {
        status: 'READY',
        createdTripId: null,
        committedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
  });
}

describeWithDb('Phase 8 commit — a failing driver notification cannot undo the trip', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-phase8-notif-${STAMP}`,
          timezone: 'America/Chicago',
          defaultEndStopPolicy: 'NONE',
        },
        select: { id: true },
      }),
    );
    tenantId = (tenant as { id: string }).id;

    if (tenantId === PROTECTED_TENANT_ID) {
      throw new Error('REFUSED: the created tenant collided with the protected tenant id');
    }
    assertDisposable(tenantId);

    const seeded = await bypass(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: assertDisposable(tenantId),
          email: `zz-throwaway-phase8-notif-${STAMP}@example.invalid`,
          role: 'OWNER',
          isDispatchReady: true,
        },
        select: { id: true },
      });

      const client = await tx.carrierClient.create({
        data: { orgId: tenantId, name: `ZZ Notif Client ${STAMP}` },
        select: { id: true },
      });

      // Addresses match the consignments exactly, so the Phase 4 ladder links
      // both at T2 and the commit reads the same facility ids the real path
      // would.
      await tx.carrierFacility.createMany({
        data: [
          {
            orgId: tenantId,
            name: 'ZZ Notif Consignee One',
            facilityType: 'customer_site',
            addressLine1: '1200 N Mayfair Rd',
            city: 'Wauwatosa',
            state: 'WI',
            zip: '53226',
          },
          {
            orgId: tenantId,
            name: 'ZZ Notif Consignee Two',
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
          firstName: 'ZZNotif',
          lastName: `Driver${STAMP}`,
          status: 'active',
          userId: user.id,
          cdlExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      const truck = await tx.carrierTruck.create({
        data: {
          orgId: tenantId,
          vehicleId: `ZZ-NOTIF-${STAMP}`,
          unitNumber: `ZN${STAMP.slice(-4)}`,
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
          sourceFileKeys: [`tenant-${tenantId}/imports/zz-notif-${STAMP}.jpg`],
          sourceMimeType: 'image/jpeg',
          originalName: `zz-notif-${STAMP}.jpg`,
          contentHash: `zznotif${STAMP}`,
          documentNumber: `ZZ-NOTIF-${STAMP}`,
          documentType: 'MANIFEST',
          clientId: client.id,
          pageCount: 2,
          reviewedExtraction: {
            documentType: 'MANIFEST',
            header: { documentNumber: `ZZ-NOTIF-${STAMP}` },
            consignments: CONSIGNMENTS,
            extractionWarnings: [],
          },
          createdById: user.id,
        },
        select: { id: true },
      });

      await tx.documentImportPage.createMany({
        data: [0, 1].map((n) => ({
          orgId: tenantId,
          importId: imp.id,
          pageNumber: n,
          pageHash: `zznotifpage${STAMP}-${n}`,
          storageKey: `tenant-${tenantId}/imports/zz-notif-${STAMP}-p${n}.png`,
        })),
      });

      return { userId: user.id, driverId: driver.id, truckId: truck.id, importId: imp.id };
    });

    userId = seeded.userId;
    importId = seeded.importId;
    ASSIGNMENT.primaryDriverId = seeded.driverId;
    ASSIGNMENT.truckId = seeded.truckId;
    ASSIGNMENT.scheduledDeparture = new Date(Date.now() + 86_400_000).toISOString();
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

    // VERIFIED cleanup — a silent failure leaves orphans in a production
    // database, which is worse than a red test.
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

  it('commits the trip, its stops, its load and its documents though the notification throws', async () => {
    await resetAll();
    notif.shouldThrow = true;
    notif.calls = 0;
    notif.lastErrorName = null;

    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);

    // The commit reports success. A notification failure is not a commit
    // failure, and the dispatcher is not told their trip did not happen.
    expect(outcome.ok).toBe(true);

    // Give the detached `afterResponse` fallback a turn to run and reject, so
    // this is not passing merely because the throw had not happened yet. There
    // is no request scope under vitest, so `after()` is unavailable and the
    // work runs as a floating promise.
    await new Promise((r) => setTimeout(r, 250));

    // The failure really was forced — otherwise this case proves nothing about
    // notifications, only that a commit works.
    expect(notif.calls).toBe(1);
    expect(notif.lastErrorName).toBe('ForcedNotificationFailure');

    // ---- THE ASSERTIONS THAT MATTER. Real rows, counted after the fact. ----
    const after = await countRows();
    expect(after.trips).toBe(1);
    expect(after.stops).toBe(2);
    expect(after.loads).toBe(1);
    expect(after.documents).toBe(3);

    expect(after.importRow.status).toBe('COMMITTED');
    expect(after.importRow.createdTripId).toBe(outcome.tripId);
    expect(after.importRow.committedAt).not.toBeNull();
    // Not a failed commit dressed up as a successful one.
    expect(after.importRow.failureCode).toBeNull();

    // And the rows are the real thing rather than empty shells: the stops are
    // in document order, each resolved to a facility, each carrying its own
    // page slice.
    const detail = await bypass(async (tx) =>
      tx.carrierStop.findMany({
        where: { dispatchId: outcome.tripId },
        orderBy: { sequenceOrder: 'asc' },
        select: { sequenceOrder: true, pageNumbers: true, facilityId: true },
      }),
    );
    expect(detail.map((s: { sequenceOrder: number }) => s.sequenceOrder)).toEqual([1, 2]);
    expect(detail[0].pageNumbers).toEqual([0]);
    expect(detail[1].pageNumbers).toEqual([1]);
    expect(detail.every((s: { facilityId: string | null }) => s.facilityId !== null)).toBe(true);
  }, 90_000);

  // -------------------------------------------------------------------------
  // The control. Without it, "the trip survives a failing notification" would
  // also be true of a notification that was never wired up at all.
  // -------------------------------------------------------------------------

  it('writes exactly the same rows when the notification succeeds', async () => {
    await resetAll();
    notif.shouldThrow = false;
    notif.calls = 0;

    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
    expect(outcome.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 250));
    expect(notif.calls).toBe(1);

    const after = await countRows();
    // Identical to the throwing case, so any difference between the two would
    // be the notification's doing and nothing else's.
    expect(after.trips).toBe(1);
    expect(after.stops).toBe(2);
    expect(after.loads).toBe(1);
    expect(after.documents).toBe(3);
    expect(after.importRow.status).toBe('COMMITTED');
    expect(after.importRow.failureCode).toBeNull();
  }, 90_000);
});
