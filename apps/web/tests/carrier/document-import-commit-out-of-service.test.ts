/**
 * Phase 8 — an out-of-service truck is OFFERED, FLAGGED and REFUSED. quick-537, Part B.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11 lists an
 * out-of-service truck as a BLOCK, and blocks name their reason.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS COULD NOT HAVE BEEN TESTED BEFORE quick-536
 * ---------------------------------------------------------------------------
 * `TRAILER_TYPES` used to claim `flatbed`, `reefer` and `tanker` — three
 * ordinary tractor body styles — so every truck of those types was diverted out
 * of the Truck picker and into the Trailer list. The only `out_of_service` row
 * in the entire database is a `flatbed`, so the two defects sat on the same row
 * and the block was unreachable from the Truck picker. quick-536 emptied that
 * set against `carrier_trucks_truck_type_check`; this suite is the test that
 * became possible.
 *
 * ===========================================================================
 * THIS TEST ASSERTS ON ROWS AND ON REAL RETURN VALUES. NOTHING IS MOCKED.
 * ===========================================================================
 *
 * No `vi.mock`, no `vi.fn`, no `vi.spyOn`. `getCommitPreview` and
 * `handleCommitImport` run for real against a real PostgreSQL connection over a
 * real disposable tenant, and the row-delta assertions are `count()` queries
 * issued before and after the refused POST.
 *
 * ---------------------------------------------------------------------------
 * WHY THE HANDLER RATHER THAN AN HTTP REQUEST
 * ---------------------------------------------------------------------------
 * `handleCommitImport` is the transport-neutral layer both surfaces mirror, and
 * the route file contributes nothing to the status but authentication and JSON
 * serialisation. Its entire POST body, after the session check, is:
 *
 *     const result = await handleCommitImport(orgId, session.userId, id, body, staffViewer(session));
 *     return NextResponse.json(result.body, { status: result.status });
 *
 * So `result.status` IS the HTTP status, and asserting on it is asserting on
 * what the endpoint answers — without standing up a server and a Supabase
 * session, which would test the auth stack rather than the block.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WOULD FAIL IF THE BLOCK REGRESSED
 * ---------------------------------------------------------------------------
 *   - Truck filtered out of the picker again (the quick-536 regression):
 *     `expect(oos).toBeDefined()` fails with "expected undefined not to be
 *     undefined", and the `find` that produced it names the unit number.
 *   - Truck listed but not flagged: `expect(oos.blocked).toBe(true)` fails with
 *     "expected false to be true".
 *   - Block dropped from validation: `expect(codes).toContain('TRUCK_OUT_OF_SERVICE')`
 *     fails, printing the codes that WERE produced.
 *   - Block downgraded to a warning, or the endpoint made permissive:
 *     `expect(res.status).toBe(422)` fails with "expected 200 to be 422" — and
 *     right behind it the row deltas go non-zero, which is the failure that
 *     matters, because it means a trip was created on a truck that may not
 *     legally move.
 *
 * ---------------------------------------------------------------------------
 * "WRITES NOTHING" IS NOT LITERALLY TRUE, AND THIS SUITE SAYS SO
 * ---------------------------------------------------------------------------
 * A refused commit creates no trip, no stops, no load and no documents, and
 * leaves the import on READY. It DOES write `facility_external_references`,
 * because `commitImport` runs the four pre-transaction mutation boundaries
 * before it validates. That is deliberate — see the second case, which asserts
 * the exact count rather than relaxing the assertion to hide it, and then
 * proves the write is a one-time learning step by issuing a second refused POST
 * and requiring the count not to move.
 *
 * And it cannot pass vacuously: a control case flips the SAME truck to
 * `status='active'` and asserts the block disappears, the truck becomes
 * unblocked, and the commit is no longer refused for that reason. "Everything
 * is blocked" fails that case.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * Identical discipline to `document-import-commit-rollback.test.ts` (DEC-3:
 * there is no local database, both env files point at the one Supabase project,
 * which is production):
 *
 *   1. A throwaway tenant whose NAME says so — `ZZ-THROWAWAY-PHASE8-OOS-…`.
 *   2. `assertDisposable()` before every scoped write, plus an explicit by-name
 *      refusal of `PROTECTED_TENANT_ID`.
 *   3. `afterAll` deletes, then RE-COUNTS, and throws if anything survived.
 *   4. The whole suite skips when `DATABASE_URL` is unset.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AssignmentInput } from '@/lib/document-import/commit-service';

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
let getCommitPreview: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handleCommitImport: any = null;

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ getCommitPreview } = await import('@/lib/document-import/commit-service'));
  ({ handleCommitImport } = await import('@/lib/document-import/handlers'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-PHASE8-OOS-${STAMP}`;

/**
 * `flatbed`, deliberately.
 *
 * The real out-of-service truck in production is a flatbed, and `flatbed` is
 * one of the three tractor types quick-536 removed from `TRAILER_TYPES`. Using
 * it here means this suite re-fails if that set is ever repopulated — the
 * classification fix and the block are tested by the same fixture, which is
 * what the collision on that one production row deserves.
 */
const OOS_TRUCK_TYPE = 'flatbed';
const OOS_UNIT = `ZZOOS${STAMP.slice(-5)}`;
const HEALTHY_UNIT = `ZZOK${STAMP.slice(-5)}`;

let tenantId = '';
let userId = '';
let importId = '';
let oosTruckId = '';
let healthyTruckId = '';

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
    externalCode: 'ZZOOS-1',
    name: 'ZZ OOS Consignee One',
    address: {
      line1: '1200 N Mayfair Rd',
      city: 'Wauwatosa',
      state: 'WI',
      postalCode: '53226',
      country: 'US',
    },
    appointment: null,
    references: [{ type: 'PRO', value: 'ZZ-OOS-0001' }],
    totals: {},
    lineItems: [{ sku: 'ZZ-O-1', description: 'Tyres', quantity: 6, uom: 'EA', weight: 480 }],
    fieldConfidence: {},
    stopType: 'delivery',
    requiredDocuments: ['POD'],
  },
  {
    pageNumbers: [1],
    externalCode: 'ZZOOS-2',
    name: 'ZZ OOS Consignee Two',
    address: {
      line1: '4800 S 27th St',
      city: 'Greenfield',
      state: 'WI',
      postalCode: '53221',
      country: 'US',
    },
    appointment: null,
    references: [{ type: 'PRO', value: 'ZZ-OOS-0002' }],
    totals: {},
    lineItems: [{ sku: 'ZZ-O-2', description: 'Batteries', quantity: 12, uom: 'EA', weight: 900 }],
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

/** Everything the refused POST must not have created. */
async function countRows() {
  return bypass(async (tx) => ({
    trips: await tx.trip.count({ where: { orgId: tenantId } }),
    stops: await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } }),
    loads: await tx.carrierLoad.count({ where: { orgId: tenantId } }),
    documents: await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } }),
    externalRefs: await tx.facilityExternalReference.count({ where: { orgId: tenantId } }),
    importStatus: (
      await tx.documentImport.findUnique({
        where: { id: importId },
        select: { status: true },
      })
    ).status,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function truckOption(view: any, unit: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return view.trucks.find((t: any) => t.unitNumber === unit);
}

describeWithDb('Phase 8 — an out-of-service truck is offered, flagged and refused', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-phase8-oos-${STAMP}`,
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
          email: `zz-throwaway-phase8-oos-${STAMP}@example.invalid`,
          role: 'OWNER',
          isDispatchReady: true,
        },
        select: { id: true },
      });

      const client = await tx.carrierClient.create({
        data: { orgId: tenantId, name: `ZZ OOS Client ${STAMP}` },
        select: { id: true },
      });

      // Addresses match the consignments exactly, so the Phase 4 ladder links
      // both at T2 and validation has no stop-level blocks to confuse the
      // truck block with.
      await tx.carrierFacility.createMany({
        data: [
          {
            orgId: tenantId,
            name: 'ZZ OOS Consignee One',
            facilityType: 'customer_site',
            addressLine1: '1200 N Mayfair Rd',
            city: 'Wauwatosa',
            state: 'WI',
            zip: '53226',
          },
          {
            orgId: tenantId,
            name: 'ZZ OOS Consignee Two',
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
          firstName: 'ZZOos',
          lastName: `Driver${STAMP}`,
          status: 'active',
          userId: user.id,
          // Valid for a decade — the ONLY block this suite may see is the
          // truck's. A stale licence here would make the 422 ambiguous.
          cdlExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      const oos = await tx.carrierTruck.create({
        data: {
          orgId: tenantId,
          vehicleId: `ZZ-OOS-${STAMP}`,
          unitNumber: OOS_UNIT,
          truckType: OOS_TRUCK_TYPE,
          status: 'out_of_service',
          payloadCapacityLbs: 45000,
          // Both valid, so TRUCK_INSPECTION_OVERDUE cannot fire and
          // TRUCK_OUT_OF_SERVICE is the only truck block in play.
          registrationExpiry: new Date(Date.now() + 3650 * 86_400_000),
          insuranceExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      // A healthy truck of the SAME type, so the control case proves the block
      // tracks `status` and not `truck_type`.
      const healthy = await tx.carrierTruck.create({
        data: {
          orgId: tenantId,
          vehicleId: `ZZ-OK-${STAMP}`,
          unitNumber: HEALTHY_UNIT,
          truckType: OOS_TRUCK_TYPE,
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
          sourceFileKeys: [`tenant-${tenantId}/imports/zz-oos-${STAMP}.jpg`],
          sourceMimeType: 'image/jpeg',
          originalName: `zz-oos-${STAMP}.jpg`,
          contentHash: `zzoos${STAMP}`,
          documentNumber: `ZZ-OOS-${STAMP}`,
          documentType: 'MANIFEST',
          clientId: client.id,
          pageCount: 2,
          reviewedExtraction: {
            documentType: 'MANIFEST',
            header: { documentNumber: `ZZ-OOS-${STAMP}` },
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
          pageHash: `zzoospage${STAMP}-${n}`,
          storageKey: `tenant-${tenantId}/imports/zz-oos-${STAMP}-p${n}.png`,
        })),
      });

      return {
        userId: user.id,
        driverId: driver.id,
        oosTruckId: oos.id,
        healthyTruckId: healthy.id,
        importId: imp.id,
      };
    });

    userId = seeded.userId;
    importId = seeded.importId;
    oosTruckId = seeded.oosTruckId;
    healthyTruckId = seeded.healthyTruckId;
    ASSIGNMENT.primaryDriverId = seeded.driverId;
    ASSIGNMENT.truckId = seeded.oosTruckId;
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
  // Item 5 — the picker OFFERS it, flags it, and names the reason.
  // -------------------------------------------------------------------------

  it('returns the out-of-service truck from the assignment picker, flagged and blocked', async () => {
    const view = await getCommitPreview(tenantId, userId, importId, ASSIGNMENT, null);

    // RETURNED. This is the assertion quick-536's TRAILER_TYPES fix bought: a
    // `flatbed` used to be diverted into `trailers` and never appear here.
    const oos = truckOption(view, OOS_UNIT);
    expect(oos).toBeDefined();
    expect(oos.id).toBe(oosTruckId);

    // Not hiding in the trailer list either — the split must be clean, or
    // "returned" would be satisfied by a row appearing twice.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(view.trailers.some((t: any) => t.unitNumber === OOS_UNIT)).toBe(false);
    expect(view.trailers).toHaveLength(0);

    // FLAGGED — the same `complianceFlags` / `blocked` pair the expired-CDL
    // driver row carries, rendered by the same `PickerRow` component.
    expect(oos.blocked).toBe(true);
    expect(oos.complianceFlags).toContain('Out of service');
    expect(oos.status).toBe('out_of_service');

    // The healthy truck of the same type is NOT blocked, so `blocked` tracks
    // status rather than being stuck on for this fixture.
    const healthy = truckOption(view, HEALTHY_UNIT);
    expect(healthy).toBeDefined();
    expect(healthy.blocked).toBe(false);
    expect(healthy.complianceFlags).toEqual([]);

    // AND THE REASON IS NAMED, on the verdict the footer renders.
    const blocks = view.validation.blocks as { code: string; message: string }[];
    const oosBlock = blocks.find((b) => b.code === 'TRUCK_OUT_OF_SERVICE');
    expect(oosBlock).toBeDefined();
    // Names the truck…
    expect(oosBlock!.message).toContain(OOS_UNIT);
    // …and the reason, not a generic "cannot continue".
    expect(oosBlock!.message).toBe(`Truck ${OOS_UNIT} is out of service`);

    expect(view.validation.canCommit).toBe(false);
    // The sentence under the disabled button is a real block's message, never
    // invented copy.
    expect(view.validation.blockedReason).toBe(blocks[0].message);
  }, 90_000);

  // -------------------------------------------------------------------------
  // Item 6 — the server refuses it, and writes nothing.
  // -------------------------------------------------------------------------

  it('answers 422 with a structured block code and creates no trip', async () => {
    const before = await countRows();

    const res = await handleCommitImport(
      tenantId,
      userId,
      importId,
      { primaryDriverId: ASSIGNMENT.primaryDriverId, truckId: oosTruckId, scheduledDeparture: ASSIGNMENT.scheduledDeparture },
      null,
    );

    // `result.status` IS the HTTP status — the route passes it straight to
    // `NextResponse.json(result.body, { status: result.status })`.
    expect(res.status).toBe(422);

    const data = res.body.data as {
      ok: boolean;
      reason: string;
      validation: { blocks: { code: string; message: string }[]; blockedReason: string; canCommit: boolean };
    };
    expect(data.ok).toBe(false);
    expect(data.reason).toBe('BLOCKED');

    // STRUCTURED — a code the caller can branch on, not a prose string it has
    // to pattern-match.
    const codes = data.validation.blocks.map((b) => b.code);
    expect(codes).toContain('TRUCK_OUT_OF_SERVICE');
    expect(
      data.validation.blocks.find((b) => b.code === 'TRUCK_OUT_OF_SERVICE')!.message,
    ).toBe(`Truck ${OOS_UNIT} is out of service`);
    expect(data.validation.canCommit).toBe(false);

    // ---- ZERO TRIP DELTA, READ BACK OFF THE DATABASE ----
    const after = await countRows();
    expect(after.trips).toBe(before.trips);
    expect(after.stops).toBe(before.stops);
    expect(after.loads).toBe(before.loads);
    expect(after.documents).toBe(before.documents);

    // Absolute, not just unchanged — "unchanged" would also hold if the
    // fixture had somehow started dirty.
    expect(after.trips).toBe(0);
    expect(after.stops).toBe(0);
    expect(after.loads).toBe(0);
    expect(after.documents).toBe(0);

    // A blocked commit is not an attempted commit: the import never left READY,
    // so it is not stranded in COMMITTING or bounced to NEEDS_REVIEW.
    expect(after.importStatus).toBe('READY');
    expect(before.importStatus).toBe('READY');

    // -----------------------------------------------------------------------
    // ONE TABLE DOES MOVE, AND IT IS NOT A BUG. STATED RATHER THAN ASSERTED
    // AWAY, BECAUSE "writes nothing" IS NOT LITERALLY TRUE.
    // -----------------------------------------------------------------------
    // `commitImport` runs the four pre-transaction mutation boundaries
    // (`ensureAllCommitted`, commit-service.ts:800) BEFORE validation, so a
    // refused commit has already written the `(tenant, client, code)` facility
    // references for silently-linked stops. That is deliberate and is the same
    // behaviour the rollback suite documents: those are decisions the
    // dispatcher already saw on screen, and un-learning a facility mapping
    // because a truck turned out to be in the shop would be the wrong trade.
    //
    // `getCommitPreview` does NOT call `ensureAllCommitted` — only
    // `commitImport` does — so this really is the POST's doing and not a
    // leftover from the picker call in the previous case.
    expect(before.externalRefs).toBe(0);
    expect(after.externalRefs).toBe(2); // one per consignment carrying a code

    // And it is a one-time LEARNING write, not per-attempt accumulation: a
    // second refused POST must add nothing. If this ever grows, a dispatcher
    // retrying a blocked commit would be inflating a reference table.
    const second = await handleCommitImport(
      tenantId,
      userId,
      importId,
      {
        primaryDriverId: ASSIGNMENT.primaryDriverId,
        truckId: oosTruckId,
        scheduledDeparture: ASSIGNMENT.scheduledDeparture,
      },
      null,
    );
    expect(second.status).toBe(422);

    const afterSecond = await countRows();
    expect(afterSecond.externalRefs).toBe(after.externalRefs);
    expect(afterSecond.trips).toBe(0);
    expect(afterSecond.stops).toBe(0);
    expect(afterSecond.loads).toBe(0);
    expect(afterSecond.documents).toBe(0);
    expect(afterSecond.importStatus).toBe('READY');
  }, 90_000);

  // -------------------------------------------------------------------------
  // The control. Without it, every assertion above is also true of a picker
  // that blocks everything and an endpoint that refuses everything.
  // -------------------------------------------------------------------------

  it('stops blocking once the same truck returns to service', async () => {
    await bypass((tx) =>
      tx.carrierTruck.updateMany({
        where: { id: oosTruckId, orgId: assertDisposable(tenantId) },
        data: { status: 'active' },
      }),
    );

    const view = await getCommitPreview(tenantId, userId, importId, ASSIGNMENT, null);

    const nowFine = truckOption(view, OOS_UNIT);
    expect(nowFine).toBeDefined();
    expect(nowFine.blocked).toBe(false);
    expect(nowFine.complianceFlags).toEqual([]);

    const codes = (view.validation.blocks as { code: string }[]).map((b) => b.code);
    expect(codes).not.toContain('TRUCK_OUT_OF_SERVICE');
    expect(view.validation.canCommit).toBe(true);
    expect(view.validation.blockedReason).toBeNull();

    // Put it back, so the suite leaves the fixture as it found it and the
    // cases stay order-independent.
    await bypass((tx) =>
      tx.carrierTruck.updateMany({
        where: { id: oosTruckId, orgId: assertDisposable(tenantId) },
        data: { status: 'out_of_service' },
      }),
    );
  }, 90_000);
});
