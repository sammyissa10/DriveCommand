/**
 * Phase 8, the fourth wiring obligation — template appointment windows
 * materialise at commit. quick-536, Part D.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SUITE EXISTS
 * ---------------------------------------------------------------------------
 * The Phase 8 browser verification committed a real import and found
 * `appointment_start` and `appointment_end` NULL on all six stops. That was
 * CORRECT for that trip — `route_template_id` was null because "Use this
 * template" was never clicked, so there were no offsets to materialise — but it
 * means the obligation was never actually exercised. A green verification that
 * only ever saw the null branch is a verification of the null branch.
 *
 * ---------------------------------------------------------------------------
 * WHAT MATERIALISATION IS
 * ---------------------------------------------------------------------------
 * quick-515 settled that a template's windows are NOT materialised when the
 * template is applied. `route_templates` stores offsets in minutes from the
 * trip's start, and while an import is under review the trip has no start time,
 * so there is nothing correct to compute. `mergeTemplateStop` carries
 * `templateApptOffsetStartMin` / `templateApptOffsetEndMin` on the consignment
 * for display, and Phase 8 does the arithmetic at commit, anchored to
 * `scheduledDeparture`:
 *
 *     appointment_start = scheduledDeparture + offsetStartMin * 60000
 *     appointment_end   = scheduledDeparture + offsetEndMin   * 60000
 *
 * ---------------------------------------------------------------------------
 * THE FIXTURE, AND WHY THESE NUMBERS
 * ---------------------------------------------------------------------------
 * MKE-NORTH-2's real offsets, read off production:
 *
 *     template stop 1   630 / 720
 *     template stop 2   480 / 600
 *     template stop 3   750 / 840
 *     template stop 4   870 / 960
 *
 * Deliberately kept in THAT order rather than sorted. The template's own
 * sequence is not ascending by time — stop 1 opens at 630 and stop 2 at 480 —
 * so a bug that sorted, re-indexed, or paired offsets to positions by order
 * would produce a plausible-looking set of windows that belonged to the wrong
 * stops. Sorted fixtures cannot see that. Each offset here has to travel with
 * its own consignment, and the assertion checks the pairing per stop rather
 * than the multiset of times.
 *
 * A departure with a non-zero minute component (07:23) is used for the same
 * reason: a midnight or on-the-hour anchor lets an implementation that
 * truncated to the hour, or dropped the anchor entirely and used start-of-day,
 * still land on the expected instant.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WOULD FAIL IF MATERIALISATION WERE BROKEN
 * ---------------------------------------------------------------------------
 * If the offsets were never applied — the state the browser check could not
 * distinguish from "no template" — `appointment_start` would be null and
 * `expect(stop.appointmentStart).not.toBeNull()` fails, followed by
 * `expected null to be 2026-…T…` on the instant itself. If the anchor were
 * wrong (the template's own `scheduled_departure_time` rather than the trip's,
 * which is the bug quick-515 removed), every instant would be off by the same
 * amount and the equality fails with two timestamps that differ by exactly that
 * offset. If the pairing were sorted, stops 1 and 2 would swap and fail while
 * 3 and 4 passed — a signature no other bug produces.
 *
 * The suite cannot pass vacuously either: the last case commits a stop with NO
 * offsets alongside stops that have them, and asserts that one is null while
 * the others are not. "Everything is null" and "everything is a window" both
 * fail it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * Identical discipline to `document-import-commit-rollback.test.ts` (DEC-3:
 * there is no local database): a throwaway tenant whose NAME says so,
 * `assertDisposable()` before every scoped write, an explicit by-name refusal
 * of `PROTECTED_TENANT_ID`, `afterAll` cleanup VERIFIED by re-counting, and the
 * whole suite skipped when `DATABASE_URL` is unset.
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
let commitImport: any = null;

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ commitImport } = await import('@/lib/document-import/commit-service'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-PHASE8-WINDOWS-${STAMP}`;

/**
 * MKE-NORTH-2's offsets, in the template's own order. NOT sorted — see the
 * header. `[startMin, endMin]`.
 */
const OFFSETS: [number, number][] = [
  [630, 720],
  [480, 600],
  [750, 840],
  [870, 960],
];

/**
 * The anchor. Tomorrow at 07:23:00.000Z — a non-zero minute so an
 * implementation that truncated to the hour, or used start-of-day, cannot land
 * on the expected instant by luck.
 */
const DEPARTURE = (() => {
  const d = new Date(Date.now() + 86_400_000);
  d.setUTCHours(7, 23, 0, 0);
  return d;
})();

const MINUTE = 60_000;

let tenantId = '';
let userId = '';
let templateId = '';
let importId = '';
let noOffsetImportId = '';

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

/** Four facilities whose addresses the ladder resolves at T2, in stop order. */
const FACILITIES = [
  { name: 'ZZ Windows Stop One', line1: '1200 N Mayfair Rd', city: 'Wauwatosa', zip: '53226' },
  { name: 'ZZ Windows Stop Two', line1: '4800 S 27th St', city: 'Greenfield', zip: '53221' },
  { name: 'ZZ Windows Stop Three', line1: '7000 W Good Hope Rd', city: 'Milwaukee', zip: '53223' },
  { name: 'ZZ Windows Stop Four', line1: '3600 S 108th St', city: 'Greenfield', zip: '53228' },
];

/**
 * The consignments a template application leaves behind.
 *
 * `templateOrigin: 'MATCHED'` and the two offset keys are exactly what
 * `mergeTemplateStop` writes — the offsets carried, the appointment untouched.
 * `appointment: null` matters: `materialiseWindow` prefers a window PRINTED on
 * the document over the template's offsets, so a fixture that carried one would
 * take the other branch and never exercise the arithmetic under test.
 */
function consignmentsWithOffsets() {
  return FACILITIES.map((f, i) => ({
    pageNumbers: [i],
    externalCode: `ZZWIN-${i + 1}`,
    name: f.name,
    address: {
      line1: f.line1,
      city: f.city,
      state: 'WI',
      postalCode: f.zip,
      country: 'US',
    },
    appointment: null,
    references: [{ type: 'PRO', value: `ZZ-WIN-000${i + 1}` }],
    totals: {},
    lineItems: [
      { sku: `ZZ-W-${i + 1}`, description: 'Tyres', quantity: 4 + i, uom: 'EA', weight: 200 + i },
    ],
    fieldConfidence: {},
    stopType: 'delivery',
    requiredDocuments: ['POD'],
    templateOrigin: 'MATCHED',
    skipped: false,
    templateApptOffsetStartMin: OFFSETS[i][0],
    templateApptOffsetEndMin: OFFSETS[i][1],
  }));
}

const ASSIGNMENT: AssignmentInput = {
  primaryDriverId: null,
  truckId: null,
  trailerId: null,
  coDriverId: null,
  scheduledDeparture: DEPARTURE.toISOString(),
  notes: null,
};

describeWithDb('Phase 8 commit — template appointment windows materialise on real rows', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-phase8-windows-${STAMP}`,
          timezone: 'America/Chicago',
          // NONE keeps the end stop out of this fixture — it is Phase 7's
          // behaviour with its own 65 tests, and it carries no window.
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
          email: `zz-throwaway-phase8-windows-${STAMP}@example.invalid`,
          role: 'OWNER',
          isDispatchReady: true,
        },
        select: { id: true },
      });

      const client = await tx.carrierClient.create({
        data: { orgId: tenantId, name: `ZZ Windows Client ${STAMP}` },
        select: { id: true },
      });

      const facilityIds: string[] = [];
      for (const f of FACILITIES) {
        const row = await tx.carrierFacility.create({
          data: {
            orgId: tenantId,
            name: f.name,
            facilityType: 'customer_site',
            addressLine1: f.line1,
            city: f.city,
            state: 'WI',
            zip: f.zip,
          },
          select: { id: true },
        });
        facilityIds.push(row.id);
      }

      // A real route template carrying the real offsets. The commit reads the
      // offsets off the consignments, not off this row — but the template is
      // created and linked so the committed trip is the shape the obligation
      // describes (`dispatches.route_template_id` set), rather than a
      // consignment fixture floating free of any template.
      //
      // `route_templates.schedule_type ∈ fixed_days|frequency|on_call` and
      // `equipment_type ∈ dry_van|flatbed|reefer|tanker|step_deck|other`, both
      // read off pg_constraint. `route_template_stops.stop_type` admits FOUR
      // values — `relay_handoff` is legal on `stops` and a 23514 here.
      const template = await tx.routeTemplate.create({
        data: {
          orgId: tenantId,
          templateName: `ZZ-WINDOWS-${STAMP}`,
          clientId: client.id,
          scheduleType: 'on_call',
          equipmentType: 'dry_van',
          createdById: user.id,
        },
        select: { id: true },
      });

      await tx.routeTemplateStop.createMany({
        data: OFFSETS.map(([s, e], i) => ({
          routeTemplateId: template.id,
          sequenceOrder: i + 1,
          stopType: 'delivery',
          facilityId: facilityIds[i],
          apptWindowStartOffsetMin: s,
          apptWindowEndOffsetMin: e,
          podRequired: true,
          bolRequired: false,
          createdById: user.id,
        })),
      });

      const imp = await tx.documentImport.create({
        data: {
          orgId: tenantId,
          status: 'READY',
          sourceFileKeys: [`tenant-${tenantId}/imports/zz-windows-${STAMP}.jpg`],
          sourceMimeType: 'image/jpeg',
          originalName: `zz-windows-${STAMP}.jpg`,
          contentHash: `zzwindows${STAMP}`,
          documentNumber: `ZZ-WIN-${STAMP}`,
          documentType: 'MANIFEST',
          clientId: client.id,
          routeTemplateId: template.id,
          pageCount: 4,
          reviewedExtraction: {
            documentType: 'MANIFEST',
            header: { documentNumber: `ZZ-WIN-${STAMP}` },
            consignments: consignmentsWithOffsets(),
            extractionWarnings: [],
          },
          createdById: user.id,
        },
        select: { id: true },
      });

      // The vacuity control's import: same four stops, but stop 2 carries no
      // offsets at all.
      const mixed = consignmentsWithOffsets().map((c, i) =>
        i === 1 ? { ...c, templateApptOffsetStartMin: null, templateApptOffsetEndMin: null } : c,
      );
      const impNoOffsets = await tx.documentImport.create({
        data: {
          orgId: tenantId,
          status: 'READY',
          sourceFileKeys: [`tenant-${tenantId}/imports/zz-windows-mixed-${STAMP}.jpg`],
          sourceMimeType: 'image/jpeg',
          originalName: `zz-windows-mixed-${STAMP}.jpg`,
          contentHash: `zzwindowsmixed${STAMP}`,
          documentNumber: `ZZ-WINMIX-${STAMP}`,
          documentType: 'MANIFEST',
          clientId: client.id,
          routeTemplateId: template.id,
          pageCount: 4,
          reviewedExtraction: {
            documentType: 'MANIFEST',
            header: { documentNumber: `ZZ-WINMIX-${STAMP}` },
            consignments: mixed,
            extractionWarnings: [],
          },
          createdById: user.id,
        },
        select: { id: true },
      });

      for (const target of [imp.id, impNoOffsets.id]) {
        await tx.documentImportPage.createMany({
          data: [0, 1, 2, 3].map((n) => ({
            orgId: tenantId,
            importId: target,
            pageNumber: n,
            pageHash: `zzwinpage${STAMP}-${target.slice(0, 8)}-${n}`,
            storageKey: `tenant-${tenantId}/imports/zz-windows-${STAMP}-${target.slice(0, 8)}-p${n}.png`,
          })),
        });
      }

      const driver = await tx.carrierDriver.create({
        data: {
          orgId: tenantId,
          firstName: 'ZZWindows',
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
          vehicleId: `ZZ-WIN-${STAMP}`,
          unitNumber: `ZW${STAMP.slice(-4)}`,
          truckType: 'semi',
          status: 'active',
          payloadCapacityLbs: 45000,
          registrationExpiry: new Date(Date.now() + 3650 * 86_400_000),
          insuranceExpiry: new Date(Date.now() + 3650 * 86_400_000),
        },
        select: { id: true },
      });

      return {
        userId: user.id,
        templateId: template.id,
        importId: imp.id,
        noOffsetImportId: impNoOffsets.id,
        driverId: driver.id,
        truckId: truck.id,
      };
    });

    userId = seeded.userId;
    templateId = seeded.templateId;
    importId = seeded.importId;
    noOffsetImportId = seeded.noOffsetImportId;
    ASSIGNMENT.primaryDriverId = seeded.driverId;
    ASSIGNMENT.truckId = seeded.truckId;
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
      await tx.routeTemplateStop.deleteMany({ where: { routeTemplate: { orgId: tenantId } } });
      await tx.routeTemplate.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierFacility.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierTruck.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierDriver.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierContract.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierClient.deleteMany({ where: { orgId: tenantId } });
      // Phase 10: the commit now emits import.needs_review / trip.assigned,
      // which write InAppNotification rows. `in_app_notifications.org_id` is a
      // real FK to the tenant, so leaving them behind makes this teardown fail
      // with a foreign-key violation AFTER every assertion has already passed.
      // The tests were not wrong; the cleanup list simply predates the table
      // ever having rows in these fixtures.
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
      templates: await tx.routeTemplate.count({ where: { orgId: tenantId } }),
      templateStops: await tx.routeTemplateStop.count({
        where: { routeTemplateId: templateId },
      }),
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

  it('writes scheduledDeparture + offsetMin * 60000 into every stop window', async () => {
    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
    if (!outcome.ok) {
      throw new Error(`expected a successful commit, got ${JSON.stringify(outcome)}`);
    }

    const { trip, stops } = await bypass(async (tx) => ({
      trip: await tx.trip.findUnique({
        where: { id: outcome.tripId },
        select: { scheduledDeparture: true, routeTemplateId: true },
      }),
      stops: await tx.carrierStop.findMany({
        where: { dispatchId: outcome.tripId },
        orderBy: { sequenceOrder: 'asc' },
        select: {
          sequenceOrder: true,
          appointmentStart: true,
          appointmentEnd: true,
          appointmentIsFirm: true,
          isEndStop: true,
        },
      }),
    }));

    // The anchor really is the trip's own start time, stored as given. If this
    // drifted, every window below would drift with it and the failures would be
    // uniform — so it is asserted separately, first.
    expect(trip.scheduledDeparture.getTime()).toBe(DEPARTURE.getTime());
    // And the trip carries the template link, which is the state the browser
    // check could not produce.
    expect(trip.routeTemplateId).toBe(templateId);

    // End stop policy NONE, so four consignments are four stops and nothing
    // else. A fifth row here would mean a window was being asserted against the
    // wrong stop.
    expect(stops).toHaveLength(4);
    expect(stops.every((s: { isEndStop: boolean }) => s.isEndStop === false)).toBe(true);

    for (let i = 0; i < OFFSETS.length; i++) {
      const [startMin, endMin] = OFFSETS[i];
      const stop = stops[i];

      expect(stop.sequenceOrder).toBe(i + 1);

      // Not null — the branch the browser verification could only ever see.
      expect(stop.appointmentStart).not.toBeNull();
      expect(stop.appointmentEnd).not.toBeNull();

      // The arithmetic itself, on the real row.
      expect(stop.appointmentStart.getTime()).toBe(DEPARTURE.getTime() + startMin * MINUTE);
      expect(stop.appointmentEnd.getTime()).toBe(DEPARTURE.getTime() + endMin * MINUTE);
    }

    // Each offset travelled with ITS stop. Stop 1 opens LATER than stop 2 —
    // that is the template's own non-monotonic order, preserved. A sort or a
    // re-pairing anywhere in the chain shows up right here and nowhere else.
    expect(stops[0].appointmentStart.getTime()).toBeGreaterThan(
      stops[1].appointmentStart.getTime(),
    );

    // Firmness. `route_template_stops` has NO firmness column — only
    // `appt_window_start_offset_min` and `appt_window_end_offset_min`, read off
    // information_schema — so there is nothing to carry through, and `false` is
    // the only truthful value rather than a dropped field. A template's
    // standing offsets are a plan; marking them firm would hand Phase 7's
    // optimiser a hard constraint no consignee ever agreed to. Firmness reaches
    // a stop only from a window PRINTED on the document, which takes the other
    // branch of `materialiseWindow`.
    expect(stops.every((s: { appointmentIsFirm: boolean }) => s.appointmentIsFirm === false)).toBe(
      true,
    );
  }, 90_000);

  // -------------------------------------------------------------------------
  // The vacuity control. "Every stop has a window" must not be reachable by an
  // implementation that stamps a window on everything, and "no stop has one"
  // must not be reachable by one that stamps nothing.
  // -------------------------------------------------------------------------

  it('leaves the window null on a stop the template gave no offsets', async () => {
    // The first case left a trip on the books for this driver and truck, which
    // is a same-day OVERLAP block. Cleared, since what is under test here is
    // the window arithmetic and not the availability rules.
    await bypass(async (tx) => {
      await tx.carrierDocument.deleteMany({
        where: { dispatch: { orgId: assertDisposable(tenantId) } },
      });
      await tx.carrierStop.deleteMany({ where: { dispatch: { orgId: tenantId } } });
      await tx.carrierLoad.deleteMany({ where: { orgId: tenantId } });
      await tx.trip.deleteMany({ where: { orgId: tenantId } });
    });

    const outcome = await commitImport(tenantId, userId, noOffsetImportId, ASSIGNMENT, null);
    if (!outcome.ok) {
      throw new Error(`expected a successful commit, got ${JSON.stringify(outcome)}`);
    }

    const stops = await bypass<
      { sequenceOrder: number; appointmentStart: Date | null; appointmentEnd: Date | null }[]
    >((tx) =>
      tx.carrierStop.findMany({
        where: { dispatchId: outcome.tripId },
        orderBy: { sequenceOrder: 'asc' },
        select: { sequenceOrder: true, appointmentStart: true, appointmentEnd: true },
      }),
    );

    expect(stops).toHaveLength(4);

    // Stop 2 carried no offsets: null, not a window anchored to the departure
    // with a zero offset — which would be a plausible, wrong 07:23 appointment.
    expect(stops[1].appointmentStart).toBeNull();
    expect(stops[1].appointmentEnd).toBeNull();

    // And its neighbours still materialised, so this is not "the whole commit
    // stopped writing windows".
    for (const i of [0, 2, 3]) {
      expect(stops[i].appointmentStart).not.toBeNull();
      expect(stops[i].appointmentStart!.getTime()).toBe(
        DEPARTURE.getTime() + OFFSETS[i][0] * MINUTE,
      );
    }
  }, 90_000);
});
