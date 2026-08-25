/**
 * Phase 9-web — the `/inspection/[dispatchId]` guard, against real rows.
 *
 * WHY THIS TEST EXISTS. The full-screen walkaround lives in
 * `src/app/(driver-fullscreen)/`, a sibling of `(driver)/` rather than a child.
 * That is forced: `(driver)/layout.tsx` renders the header and both navs around
 * every child unconditionally, and on web a page cannot opt out of its own
 * layout. But that same layout is where the driver portal's session and role
 * checks live, so escaping the chrome escapes the authentication. The new group
 * had to re-establish it, and "we remembered to copy the auth check" is not
 * something to leave as a habit.
 *
 * WHAT IS PROVEN HERE, and what is not — stated rather than implied:
 *
 *   PROVEN. `resolveInspectionAccess`, the function both pages and all seven
 *   server actions call, refuses a non-driver, refuses a driver with no carrier
 *   profile, refuses a driver who is not on the trip, refuses across a tenant
 *   boundary, and allows the assigned driver. Real Postgres, real rows created
 *   in `beforeAll` and deleted in `afterAll`, no mocks and no fakes — DEC-14's
 *   point that a faked DB is not evidence applies with full force to a guard.
 *
 *   NOT PROVEN by the DB cases: that the pages still CALL it. A guard nobody
 *   invokes passes every unit test ever written for it. That is what the last
 *   `describe` block covers — it reads the four entry files off disk and
 *   asserts the call is present, the same integrity-guard shape the 31-pair
 *   address fixture uses. It is a weaker check than an HTTP request, and it is
 *   here because an HTTP-level test needs a running Next server with a real
 *   Supabase session cookie, which this suite has no harness for.
 *
 * HOW IT FAILS IF THE GUARD IS REMOVED:
 *
 *   - Delete or weaken the role check  → 'refuses an OWNER' fails: the owner
 *     receives `allowed: true` for a trip they are not the driver of.
 *   - Delete the ownership query       → 'refuses a driver who is not on this
 *     trip' and 'refuses across tenants' both fail, because every driver in the
 *     tenant resolves to allowed.
 *   - Delete the `orgId` on the trip lookup → 'refuses across tenants' fails on
 *     its own, which is the case a single-tenant dev database would otherwise
 *     never surface.
 *   - Delete the CALL from a page or action → the last describe fails and names
 *     the file.
 *
 * Skipped without DATABASE_URL, same as the driver-pay isolation suite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInspectionAccess } from '@/lib/carrier/inspection-access';
import { UserRole } from '@/lib/auth/roles';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('inspection route guard — real rows', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const marker = `insp-guard-${Date.now()}`;

  let tenantAId: string;
  let tenantBId: string;
  let driverAUserId: string;
  let driverBUserId: string;
  let ownerAUserId: string;
  let orphanUserId: string;
  let driverBTenantBUserId: string;
  let tripAId: string;
  let tripBId: string;

  const created = {
    trips: [] as string[],
    carrierDrivers: [] as string[],
    trucks: [] as string[],
    users: [] as string[],
    tenants: [] as string[],
  };

  beforeAll(async () => {
    const { PrismaClient } = await import('@/generated/prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { Pool } = await import('pg');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = new (PrismaClient as any)({ adapter });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function bypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any).$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");
        return fn(tx);
      });
    }

    await bypass(async (tx) => {
      const tenantA = await tx.tenant.create({
        data: { name: `${marker}-tenant-a`, slug: `${marker}-a` },
      });
      const tenantB = await tx.tenant.create({
        data: { name: `${marker}-tenant-b`, slug: `${marker}-b` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;
      created.tenants.push(tenantA.id, tenantB.id);

      async function makeUser(tenantId: string, role: string, tag: string) {
        const u = await tx.user.create({
          data: {
            tenantId,
            email: `${marker}-${tag}@example.test`,
            role,
            firstName: 'Guard',
            lastName: tag,
          },
        });
        created.users.push(u.id);
        return u.id;
      }

      driverAUserId = await makeUser(tenantAId, 'DRIVER', 'driver-a');
      driverBUserId = await makeUser(tenantAId, 'DRIVER', 'driver-b');
      ownerAUserId = await makeUser(tenantAId, 'OWNER', 'owner-a');
      // A DRIVER-role login with no CarrierDriver row — the shape a freshly
      // invited driver has before the carrier profile is created.
      orphanUserId = await makeUser(tenantAId, 'DRIVER', 'orphan');
      driverBTenantBUserId = await makeUser(tenantBId, 'DRIVER', 'driver-tenant-b');

      async function makeDriver(orgId: string, userId: string, tag: string) {
        const d = await tx.carrierDriver.create({
          data: {
            orgId,
            userId,
            firstName: 'Guard',
            lastName: tag,
            status: 'active',
          },
        });
        created.carrierDrivers.push(d.id);
        return d.id;
      }

      const carrierDriverA = await makeDriver(tenantAId, driverAUserId, 'a');
      const carrierDriverB = await makeDriver(tenantAId, driverBUserId, 'b');
      const carrierDriverTenantB = await makeDriver(tenantBId, driverBTenantBUserId, 'tb');

      async function makeTruck(orgId: string, unit: string) {
        const t = await tx.carrierTruck.create({
          data: {
            orgId,
            // `vehicleId` is a required unique column, not a nullable label —
            // omitting it fails the insert rather than the assertion, which is
            // a confusing way to learn about a schema.
            vehicleId: `${marker}-${unit}`,
            unitNumber: `${marker}-${unit}`,
            status: 'active',
          },
        });
        created.trucks.push(t.id);
        return t.id;
      }

      const truckA = await makeTruck(tenantAId, 'ta');
      const truckB = await makeTruck(tenantBId, 'tb');

      // Trip A: tenant A, driven by driver A.
      const tripA = await tx.trip.create({
        data: {
          orgId: tenantAId,
          primaryDriverId: carrierDriverA,
          truckId: truckA,
          // Required column with no default.
          scheduledDeparture: new Date(),
          status: 'planned',
        },
      });
      tripAId = tripA.id;
      created.trips.push(tripA.id);

      // Trip B: tenant B, driven by that tenant's own driver. Used to prove the
      // tenant boundary, not merely the assignment one.
      const tripB = await tx.trip.create({
        data: {
          orgId: tenantBId,
          primaryDriverId: carrierDriverTenantB,
          truckId: truckB,
          scheduledDeparture: new Date(),
          status: 'planned',
        },
      });
      tripBId = tripB.id;
      created.trips.push(tripB.id);

      // Referenced so the intent of creating driver B is explicit.
      expect(carrierDriverB).toBeTruthy();
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");
      await tx.trip.deleteMany({ where: { id: { in: created.trips } } });
      await tx.carrierDriver.deleteMany({ where: { id: { in: created.carrierDrivers } } });
      await tx.carrierTruck.deleteMany({ where: { id: { in: created.trucks } } });
      await tx.user.deleteMany({ where: { id: { in: created.users } } });
      await tx.tenant.deleteMany({ where: { id: { in: created.tenants } } });
    });
    await prisma.$disconnect();
  });

  it('allows the driver the trip is assigned to', async () => {
    const access = await resolveInspectionAccess({
      role: UserRole.DRIVER,
      userId: driverAUserId,
      tenantId: tenantAId,
      dispatchId: tripAId,
    });
    expect(access.allowed).toBe(true);
  });

  it('refuses a driver who is not on this trip', async () => {
    // Driver B is a real, active driver in the same tenant. Nothing but the
    // assignment check stands between them and someone else's walkaround.
    const access = await resolveInspectionAccess({
      role: UserRole.DRIVER,
      userId: driverBUserId,
      tenantId: tenantAId,
      dispatchId: tripAId,
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.reason).toBe('NOT_YOUR_TRIP');
  });

  it('refuses an OWNER, even one whose tenant owns the trip', async () => {
    const access = await resolveInspectionAccess({
      role: UserRole.OWNER,
      userId: ownerAUserId,
      tenantId: tenantAId,
      dispatchId: tripAId,
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.reason).toBe('NOT_A_DRIVER');
  });

  it('refuses a DRIVER-role user with no carrier driver profile', async () => {
    const access = await resolveInspectionAccess({
      role: UserRole.DRIVER,
      userId: orphanUserId,
      tenantId: tenantAId,
      dispatchId: tripAId,
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.reason).toBe('NO_DRIVER_PROFILE');
  });

  it('refuses across the tenant boundary', async () => {
    // Driver A, with a valid session in tenant A, naming a trip in tenant B.
    const access = await resolveInspectionAccess({
      role: UserRole.DRIVER,
      userId: driverAUserId,
      tenantId: tenantAId,
      dispatchId: tripBId,
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.reason).toBe('NOT_YOUR_TRIP');
  });

  it('refuses a null role outright', async () => {
    const access = await resolveInspectionAccess({
      role: null,
      userId: driverAUserId,
      tenantId: tenantAId,
      dispatchId: tripAId,
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.reason).toBe('NOT_A_DRIVER');
  });
});

// ---------------------------------------------------------------------------
// The guard is called — read off disk, no DB needed
// ---------------------------------------------------------------------------

describe('inspection route guard — every entry point calls it', () => {
  const appRoot = path.resolve(__dirname, '../../app');

  const entryPoints = [
    '(driver-fullscreen)/inspection/[dispatchId]/page.tsx',
    '(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx',
    '(driver-fullscreen)/inspection/actions.ts',
  ];

  it.each(entryPoints)('%s calls resolveInspectionAccess', (relative) => {
    const source = readFileSync(path.join(appRoot, relative), 'utf8');
    expect(source).toContain('resolveInspectionAccess');
  });

  it('the fullscreen layout re-establishes the role guard it escaped', () => {
    // `(driver)/layout.tsx` is where driver auth normally lives. A sibling group
    // inherits none of it, so these two lines are the whole access control for
    // an anonymous request to every route underneath.
    const source = readFileSync(path.join(appRoot, '(driver-fullscreen)/layout.tsx'), 'utf8');
    expect(source).toContain('getSession');
    expect(source).toContain('UserRole.DRIVER');
    expect(source).toContain("redirect('/unauthorized')");
  });

  it('every mutation in actions.ts is guarded, not just the first', () => {
    // Counting rather than spot-checking: a new action added without a guard
    // moves these two numbers apart, which is the failure mode this catches and
    // a `toContain` would not.
    const source = readFileSync(path.join(appRoot, '(driver-fullscreen)/inspection/actions.ts'), 'utf8');
    const exportedActions = source.match(/^export async function /gm)?.length ?? 0;
    const guardCalls = source.match(/await guard\(dispatchId\)/g)?.length ?? 0;
    expect(exportedActions).toBeGreaterThan(0);
    expect(guardCalls).toBe(exportedActions);
  });
});
