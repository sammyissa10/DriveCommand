/**
 * TKT-0076 — sample records are hidden from PICKERS and visible in LISTS.
 * quick-538, steps 8 and 9.
 *
 * ---------------------------------------------------------------------------
 * THE TWO HALVES ARE ONE RULE, AND EACH IS THE OTHER'S CONTROL
 * ---------------------------------------------------------------------------
 * "Filter it everywhere" and "show it everywhere" are both easy to implement
 * and both wrong. The rule has a seam: a seeded demo truck must not be
 * assignable to a real trip, and must still be findable in the fleet grid
 * wearing its SAMPLE pill — that grid is the only place it can be converted
 * from. Testing one side alone cannot see the seam, so every case here asserts
 * BOTH: excluded from the picker predicate, present in the list predicate, same
 * row, same run.
 *
 * That is also why this suite exists rather than a unit test on a `where`
 * clause. The bug being prevented is not "the filter is wrong"; it is "the
 * filter was applied to one of the two surfaces that read the same table".
 *
 * ===========================================================================
 * REAL ROWS. NOTHING MOCKED.
 * ===========================================================================
 * No `vi.mock`, no `vi.fn`, no `vi.spyOn`. Every assertion is a query issued
 * against a real PostgreSQL connection over a real disposable tenant.
 *
 * The predicates are the ones the application uses, restated here rather than
 * imported, because the pages that own them are React server components that
 * cannot be called from vitest. That is a deliberate, stated limitation: this
 * suite proves the RULE holds against real data, and the `grep` guard at the
 * bottom of `538-SUMMARY.md` proves each page still carries it. Neither alone
 * is sufficient.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WOULD FAIL
 * ---------------------------------------------------------------------------
 *   - Filter dropped from a picker: `expect(pickerIds).not.toContain(sampleId)`
 *     fails with the sample's own id printed in the received array.
 *   - Filter over-applied to a list (the regression this task risks most, and
 *     the one the constraint forbids): `expect(listIds).toContain(sampleId)`
 *     fails with "expected [ …real ids… ] to include '…'", and the SAMPLE pill
 *     would have vanished from the grid it is converted from.
 *   - Conversion not honoured: step 9's case fails on
 *     `expect(afterIds).toContain(sampleId)` — the record was promoted and the
 *     picker still refuses it, which is the exact promise
 *     `ConvertSampleRecord` makes on screen.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS, AND THE GUARDS ON IT
 * ---------------------------------------------------------------------------
 * Same discipline as the Phase 8 suites (DEC-3: there is no local database —
 * both env files point at the one Supabase project, which is production):
 *
 *   1. A throwaway tenant whose NAME says so — `ZZ-THROWAWAY-TKT0076-…`.
 *   2. `assertDisposable()` before every scoped write, plus an explicit by-name
 *      refusal of `PROTECTED_TENANT_ID`.
 *   3. `afterAll` deletes, then RE-COUNTS, and throws if anything survived.
 *   4. The whole suite skips when `DATABASE_URL` is unset.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/** See the Phase 8 suites: vitest does not read `.env.local`; Next does. */
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

// Dynamic — the prisma singleton reads DATABASE_URL at module load, and vitest
// hoists static imports above `loadEnvLocal()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;
if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
}

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-TKT0076-${STAMP}`;

let tenantId = '';
let sampleTruckId = '';
let realTruckId = '';
let sampleDriverId = '';
let realDriverId = '';
let sampleClientId = '';
let realClientId = '';

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
 * The two predicates under test, written exactly as the application writes
 * them.
 *
 * PICKER is `carrier/trips/new`'s clause, which quick-538 copied to every other
 * operational picker. LIST is what the management grids use — no `isSample`
 * term at all, which is the point.
 */
const PICKER_WHERE = (orgId: string) => ({
  orgId,
  isSample: false,
  deletedAt: null,
});
const LIST_WHERE = (orgId: string) => ({ orgId, deletedAt: null });

describeWithDb('TKT-0076 — samples are hidden from pickers and kept in lists', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-tkt0076-${STAMP}`,
          timezone: 'America/Chicago',
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
      // One sample and one real of each, so every assertion has both a row that
      // must disappear and a row that must not. A fixture with only samples
      // would pass against a picker that returned nothing at all.
      const mkTruck = (sample: boolean) =>
        tx.carrierTruck.create({
          data: {
            orgId: assertDisposable(tenantId),
            vehicleId: `ZZ-${sample ? 'S' : 'R'}-${STAMP}`,
            unitNumber: `ZZ${sample ? 'SAMPLE' : 'REAL'}${STAMP.slice(-4)}`,
            truckType: 'semi',
            status: 'active',
            isSample: sample,
          },
          select: { id: true },
        });

      const mkDriver = (sample: boolean) =>
        tx.carrierDriver.create({
          data: {
            orgId: tenantId,
            firstName: sample ? 'ZZSample' : 'ZZReal',
            lastName: `Driver${STAMP}`,
            status: 'active',
            isSample: sample,
          },
          select: { id: true },
        });

      const mkClient = (sample: boolean) =>
        tx.carrierClient.create({
          data: {
            orgId: tenantId,
            name: `ZZ ${sample ? 'Sample' : 'Real'} Client ${STAMP}`,
            isSample: sample,
          },
          select: { id: true },
        });

      const [st, rt, sd, rd, sc, rc] = await Promise.all([
        mkTruck(true),
        mkTruck(false),
        mkDriver(true),
        mkDriver(false),
        mkClient(true),
        mkClient(false),
      ]);
      return {
        sampleTruckId: st.id,
        realTruckId: rt.id,
        sampleDriverId: sd.id,
        realDriverId: rd.id,
        sampleClientId: sc.id,
        realClientId: rc.id,
      };
    });

    sampleTruckId = seeded.sampleTruckId;
    realTruckId = seeded.realTruckId;
    sampleDriverId = seeded.sampleDriverId;
    realDriverId = seeded.realDriverId;
    sampleClientId = seeded.sampleClientId;
    realClientId = seeded.realClientId;
  }, 90_000);

  afterAll(async () => {
    if (!hasDatabase || !tenantId) return;
    assertDisposable(tenantId);

    await bypass(async (tx) => {
      await tx.carrierTruck.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierDriver.deleteMany({ where: { orgId: tenantId } });
      await tx.carrierClient.deleteMany({ where: { orgId: tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });

    // VERIFIED cleanup — a silent failure leaves orphan rows in a production
    // database, which is worse than a red test.
    const survivors = await bypass(async (tx) => ({
      tenants: await tx.tenant.count({ where: { id: tenantId } }),
      trucks: await tx.carrierTruck.count({ where: { orgId: tenantId } }),
      drivers: await tx.carrierDriver.count({ where: { orgId: tenantId } }),
      clients: await tx.carrierClient.count({ where: { orgId: tenantId } }),
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
  // Step 8 — excluded from the picker, present in the list. Both, per entity.
  // -------------------------------------------------------------------------

  it('hides a sample truck from the picker and keeps it in the fleet list', async () => {
    const { picker, list } = await bypass(async (tx) => ({
      picker: await tx.carrierTruck.findMany({
        where: { ...PICKER_WHERE(tenantId), status: 'active' },
        select: { id: true },
      }),
      list: await tx.carrierTruck.findMany({
        where: LIST_WHERE(tenantId),
        select: { id: true, isSample: true },
      }),
    }));

    const pickerIds = picker.map((r: { id: string }) => r.id);
    expect(pickerIds).not.toContain(sampleTruckId);
    // The real one is still there, so this is not a picker that returns nothing.
    expect(pickerIds).toContain(realTruckId);

    const listIds = list.map((r: { id: string }) => r.id);
    expect(listIds).toContain(sampleTruckId);
    expect(listIds).toContain(realTruckId);
    // And it is still flagged, which is what renders the SAMPLE pill and what
    // the Convert affordance keys off.
    expect(list.find((r: { id: string }) => r.id === sampleTruckId).isSample).toBe(true);
  }, 60_000);

  it('hides a sample driver from the picker and keeps it in the driver list', async () => {
    const { picker, list } = await bypass(async (tx) => ({
      picker: await tx.carrierDriver.findMany({
        where: { ...PICKER_WHERE(tenantId), status: 'active' },
        select: { id: true },
      }),
      list: await tx.carrierDriver.findMany({
        where: LIST_WHERE(tenantId),
        select: { id: true, isSample: true },
      }),
    }));

    const pickerIds = picker.map((r: { id: string }) => r.id);
    expect(pickerIds).not.toContain(sampleDriverId);
    expect(pickerIds).toContain(realDriverId);

    const listIds = list.map((r: { id: string }) => r.id);
    expect(listIds).toContain(sampleDriverId);
    expect(list.find((r: { id: string }) => r.id === sampleDriverId).isSample).toBe(true);
  }, 60_000);

  it('hides a sample client from the picker and keeps it in the client list', async () => {
    const { picker, list } = await bypass(async (tx) => ({
      // Clients have no `status` — the picker clause is the other two terms.
      picker: await tx.carrierClient.findMany({
        where: PICKER_WHERE(tenantId),
        select: { id: true },
      }),
      list: await tx.carrierClient.findMany({
        where: LIST_WHERE(tenantId),
        select: { id: true, isSample: true },
      }),
    }));

    const pickerIds = picker.map((r: { id: string }) => r.id);
    expect(pickerIds).not.toContain(sampleClientId);
    expect(pickerIds).toContain(realClientId);

    const listIds = list.map((r: { id: string }) => r.id);
    expect(listIds).toContain(sampleClientId);
    expect(list.find((r: { id: string }) => r.id === sampleClientId).isSample).toBe(true);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Step 9 — conversion is what the on-screen copy promises. Prove it.
  // -------------------------------------------------------------------------

  it('puts a converted record into the pickers immediately', async () => {
    // Precondition, asserted rather than assumed: all three are hidden now.
    const before = await bypass(async (tx) => ({
      trucks: (
        await tx.carrierTruck.findMany({
          where: { ...PICKER_WHERE(tenantId), status: 'active' },
          select: { id: true },
        })
      ).map((r: { id: string }) => r.id),
      drivers: (
        await tx.carrierDriver.findMany({
          where: { ...PICKER_WHERE(tenantId), status: 'active' },
          select: { id: true },
        })
      ).map((r: { id: string }) => r.id),
      clients: (
        await tx.carrierClient.findMany({ where: PICKER_WHERE(tenantId), select: { id: true } })
      ).map((r: { id: string }) => r.id),
    }));
    expect(before.trucks).not.toContain(sampleTruckId);
    expect(before.drivers).not.toContain(sampleDriverId);
    expect(before.clients).not.toContain(sampleClientId);

    // What `ConvertSampleRecord` does: PATCH `{ isSample: false }`. The write is
    // the same one the endpoint performs; what is under test is that the picker
    // predicate honours it with no other step in between — no cache to bust, no
    // second flag to clear.
    await bypass(async (tx) => {
      await tx.carrierTruck.updateMany({
        where: { id: sampleTruckId, orgId: assertDisposable(tenantId) },
        data: { isSample: false },
      });
      await tx.carrierDriver.updateMany({
        where: { id: sampleDriverId, orgId: tenantId },
        data: { isSample: false },
      });
      await tx.carrierClient.updateMany({
        where: { id: sampleClientId, orgId: tenantId },
        data: { isSample: false },
      });
    });

    const after = await bypass(async (tx) => ({
      trucks: (
        await tx.carrierTruck.findMany({
          where: { ...PICKER_WHERE(tenantId), status: 'active' },
          select: { id: true },
        })
      ).map((r: { id: string }) => r.id),
      drivers: (
        await tx.carrierDriver.findMany({
          where: { ...PICKER_WHERE(tenantId), status: 'active' },
          select: { id: true },
        })
      ).map((r: { id: string }) => r.id),
      clients: (
        await tx.carrierClient.findMany({ where: PICKER_WHERE(tenantId), select: { id: true } })
      ).map((r: { id: string }) => r.id),
    }));

    expect(after.trucks).toContain(sampleTruckId);
    expect(after.drivers).toContain(sampleDriverId);
    expect(after.clients).toContain(sampleClientId);

    // Converted, not duplicated — the real rows are still there exactly once.
    expect(after.trucks).toHaveLength(2);
    expect(after.drivers).toHaveLength(2);
    expect(after.clients).toHaveLength(2);

    // Put them back, so the suite leaves its fixture as it found it and the
    // cases stay order-independent.
    await bypass(async (tx) => {
      await tx.carrierTruck.updateMany({
        where: { id: sampleTruckId, orgId: assertDisposable(tenantId) },
        data: { isSample: true },
      });
      await tx.carrierDriver.updateMany({
        where: { id: sampleDriverId, orgId: tenantId },
        data: { isSample: true },
      });
      await tx.carrierClient.updateMany({
        where: { id: sampleClientId, orgId: tenantId },
        data: { isSample: true },
      });
    });
  }, 60_000);
});

/**
 * The other half of the proof.
 *
 * The suite above shows the RULE holds against real rows. It cannot show that a
 * given page still applies it, because these pages are React server components
 * that vitest cannot invoke. So this reads them off disk and requires the
 * predicate to be present — the same shape as the facility-address fixture
 * guard, and for the same reason: a filter deleted from one page is exactly the
 * failure TKT-0076 already suffered once, when it was applied to the surfaces
 * that existed and never backfilled.
 *
 * Deliberately NOT gated on DATABASE_URL — it is a source assertion and must
 * run everywhere, including in whatever CI eventually has no database.
 *
 * If a page below is legitimately retired, delete its entry here in the same
 * commit. Do not weaken the pattern to make a run green.
 */
describe('TKT-0076 — every operational picker page still carries the predicate', () => {
  const PICKER_PAGES = [
    'src/app/(owner)/carrier/trips/new/page.tsx',
    'src/app/(owner)/carrier/trips/[id]/page.tsx',
    'src/app/(owner)/carrier/loads/new/page.tsx',
    'src/app/(owner)/carrier/loads/[id]/page.tsx',
    'src/app/(owner)/carrier/templates/new/page.tsx',
    'src/app/(owner)/carrier/templates/[id]/page.tsx',
  ];

  for (const page of PICKER_PAGES) {
    it(`${page} filters isSample on every picker query`, () => {
      const src = readFileSync(resolve(process.cwd(), page), 'utf8');

      // Every org-scoped `findMany` on these pages is a picker query. None of
      // them may be left in the unfiltered shape.
      const unfiltered = ['where: { orgId },', "where: { orgId, status: 'active' },"].filter(
        (pattern) => src.includes(pattern),
      );

      expect(unfiltered).toEqual([]);
      expect(src).toContain('isSample: false');
    });
  }

  it('the mobile driver PICKER filters and its LIST sibling does not', () => {
    const picker = readFileSync(
      resolve(process.cwd(), 'src/app/api/mobile/owner/drivers/active/route.ts'),
      'utf8',
    );
    const list = readFileSync(
      resolve(process.cwd(), 'src/app/api/mobile/owner/drivers/route.ts'),
      'utf8',
    );

    expect(picker).toContain('isSample: false');
    // The list must NOT filter — samples belong in the grid with their pill,
    // and that grid is the only place a record can be converted from. This is
    // the assertion that catches an over-eager backfill.
    expect(list).not.toContain('isSample: false');
  });

  it('the shared endpoints keep sample filtering opt-in and default off', () => {
    for (const file of ['src/lib/carrier/loads.ts', 'src/app/api/mobile/owner/trucks/route.ts']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      // Opt-in: the term is only reachable through a flag, never unconditional.
      expect(src).toContain('excludeSamples ? { isSample: false } : {}');
    }
  });
});
