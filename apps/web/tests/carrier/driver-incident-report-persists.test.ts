/**
 * quick-570 — `submitIncidentReport` must never report success without a row.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CATCHES, AND HOW IT FAILS
 * ---------------------------------------------------------------------------
 *
 * The defect this pins is not subtle and is not hypothetical — it is the state
 * this file was written to end. `submitIncidentReport` returned
 *
 *     { success: true, message: 'Incident report submitted successfully.
 *                                Dispatch has been notified.' }
 *
 * from a body that contained no write and no notification. `DriverIncident`
 * held zero rows in production.
 *
 * **How it would fail:** case 1 calls the real action and then counts
 * `DriverIncident` rows for the disposable tenant. Against the old
 * implementation the action still returns `success: true` — so an assertion on
 * the RETURN VALUE alone would pass, which is exactly why there is none. The
 * count is 0, `expect(rows).toHaveLength(1)` fails, and the message names it.
 * Re-introduce the early `return { success: true }` above the create and this
 * test goes red on the row count, not on the response.
 *
 * That is the quick-549 lesson applied deliberately: **row assertions and
 * response assertions catch different classes, and a stub is invisible to the
 * second.** The response was correct-looking the entire time it was a lie.
 *
 * Case 2 pins the ordering rule from Section 11 the other way round: with the
 * notification forced to throw, the incident must still be recorded and the
 * driver must still be told it was. A driver's report being saved matters more
 * than dispatch being told instantly, so a notification failure may never turn
 * a saved report into an error message.
 *
 * Case 3 pins the lossy category map, because it is the one place a silent
 * wrong answer is possible: `BREAKDOWN` is not an `IncidentCategory`, and a
 * mapping that quietly regressed to `OTHER` for everything would still write a
 * row and still pass case 1.
 *
 * ---------------------------------------------------------------------------
 * WHY A REAL DATABASE
 * ---------------------------------------------------------------------------
 *
 * There is no local database (DEC-3), so this follows the convention set by
 * `document-import-commit-rollback.test.ts`: create a disposable tenant, scope
 * every write to its id, verify the cleanup rather than assume it, and name the
 * live tenant as a tripwire. A faked Prisma would prove nothing here — the
 * whole claim is "a row exists", and a mock that records a call is the same
 * class of evidence as the sentence that started this.
 *
 * Deliberately NOT mocked: `getTenantPrisma`, in the sense that the client it
 * returns is the app's real one. What IS mocked is only the identity the action
 * reads from headers — `requireRole`, `getSession`, `getCurrentUser` — because
 * a server action has no request scope under vitest and `headers()` throws
 * outside one. That is the same trap that has left 45 workflow tests dead since
 * the RLS Phase 2 sweep; mocking the header readers is how this file avoids
 * joining them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/** See `document-import-commit-rollback.test.ts` for why this is hand-parsed
 *  and why it lives in the file rather than in a shared `setupFiles` entry. */
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

/** The live tenant this suite must never write to, under any circumstance. */
const PROTECTED_TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';

const STAMP = `${Date.now()}`;
const TENANT_NAME = `ZZ-THROWAWAY-QUICK570-INCIDENT-${STAMP}`;

let tenantId = '';
let userId = '';

// The identity the action would otherwise read from request headers.
const session = { userId: '', tenantId: '', role: 'DRIVER', email: '', isSystemAdmin: false };
const currentUser = { id: '', firstName: 'ZZThrowaway', lastName: `Driver${STAMP}` };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;

const emitSpy = vi.fn();

vi.mock('@/lib/auth/supabase', () => ({
  requireRole: vi.fn(async () => 'DRIVER'),
  getSession: vi.fn(async () => session),
  getCurrentUser: vi.fn(async () => currentUser),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: async () => {
    const mod = await import('@/lib/db/prisma');
    return mod.prisma;
  },
}));

vi.mock('@/lib/notifications/emit', () => ({
  emitNotificationAfterResponse: (...args: unknown[]) => emitSpy(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let submitIncidentReport: any = null;

if (hasDatabase) {
  ({ prisma } = await import('@/lib/db/prisma'));
  ({ submitIncidentReport } = await import('@/app/(driver)/actions/driver-incidents'));
}

function assertDisposable(id: string): string {
  if (id === PROTECTED_TENANT_ID) {
    throw new Error(`REFUSED: attempted to touch the protected tenant ${PROTECTED_TENANT_ID}`);
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

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function incidentsForTenant(): Promise<any[]> {
  return bypass((tx) =>
    tx.driverIncident.findMany({
      where: { tenantId: assertDisposable(tenantId) },
      orderBy: { createdAt: 'asc' },
    }),
  );
}

// ---------------------------------------------------------------------------

describeWithDb('submitIncidentReport — success implies a row, asserted against the database', () => {
  beforeAll(async () => {
    const tenant = await bypass((tx) =>
      tx.tenant.create({
        data: {
          name: TENANT_NAME,
          slug: `zz-throwaway-quick570-incident-${STAMP}`,
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

    const user = await bypass((tx) =>
      tx.user.create({
        data: {
          tenantId: assertDisposable(tenantId),
          email: `zz-throwaway-quick570-${STAMP}@example.invalid`,
          role: 'DRIVER',
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
        },
        select: { id: true },
      }),
    );
    userId = (user as { id: string }).id;

    session.userId = userId;
    session.tenantId = tenantId;
    session.email = `zz-throwaway-quick570-${STAMP}@example.invalid`;
    currentUser.id = userId;
  }, 60_000);

  afterAll(async () => {
    if (!hasDatabase || !tenantId) return;
    assertDisposable(tenantId);

    // Children before the tenant. `DriverIncident.tenantId` is a real foreign
    // key, so leaving rows behind fails the FILE after every assertion has
    // already passed — the quick-546 shape.
    await bypass(async (tx) => {
      await tx.driverIncident.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });

    const survivors = await bypass(async (tx) => ({
      incidents: await tx.driverIncident.count({ where: { tenantId } }),
      users: await tx.user.count({ where: { tenantId } }),
      tenants: await tx.tenant.count({ where: { id: tenantId } }),
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

  it('records a DriverIncident row — success is never reported without one', async () => {
    emitSpy.mockReset();

    const result = await submitIncidentReport(
      null,
      form({
        type: 'ACCIDENT',
        severity: 'HIGH',
        location: 'I-94 W, Mile Marker 312',
        description: 'Rear-ended at a merge. No injuries. Trailer door is bent.',
      }),
    );

    // The row is the assertion. The old stub returned this same success object
    // with nothing behind it, so `result.success` proves nothing on its own and
    // is checked only after the row has been found.
    const rows = await incidentsForTenant();
    expect(
      rows,
      'submitIncidentReport reported success but wrote no DriverIncident row',
    ).toHaveLength(1);

    expect(rows[0].driverId).toBe(userId);
    expect(rows[0].tenantId).toBe(tenantId);
    expect(rows[0].category).toBe('ACCIDENT');
    expect(rows[0].severity).toBe('HIGH');
    expect(rows[0].description).toBe('Rear-ended at a merge. No injuries. Trailer door is bent.');
    // The location has no column of its own; it must survive in `notes` rather
    // than being read into a variable and dropped, which is what used to happen.
    expect(rows[0].notes).toContain('I-94 W, Mile Marker 312');
    expect(rows[0].reportedAt).toBeInstanceOf(Date);

    expect(result.success).toBe(true);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe('driver.incident_reported');
    expect(emitSpy.mock.calls[0][1].relatedEntity).toEqual({
      type: 'driver_incident',
      id: rows[0].id,
    });
  }, 30_000);

  it('keeps the incident when the notification fails — Section 11 ordering', async () => {
    emitSpy.mockReset();
    emitSpy.mockImplementationOnce(() => {
      throw new Error('simulated notification failure');
    });

    const before = (await incidentsForTenant()).length;

    const result = await submitIncidentReport(
      null,
      form({
        type: 'MEDICAL',
        severity: 'HIGH',
        location: '',
        description: 'Co-driver reported chest pains. Pulled over and called 911.',
      }),
    );

    const rows = await incidentsForTenant();
    expect(
      rows.length,
      'a failing notification lost the incident — the write must not depend on the notify',
    ).toBe(before + 1);
    // And the driver is still told it was recorded, because it was. Turning a
    // saved report into an error message is the inversion Section 11 forbids.
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  }, 30_000);

  it('maps a form type the enum cannot hold, and keeps the reported wording', async () => {
    emitSpy.mockReset();
    const before = (await incidentsForTenant()).length;

    // BREAKDOWN is not an IncidentCategory. Written raw it is a Postgres 22P02;
    // mapped blindly to OTHER it would lose what the driver actually said.
    const result = await submitIncidentReport(
      null,
      form({
        type: 'BREAKDOWN',
        severity: 'MEDIUM',
        location: 'Rest stop, US-41 N',
        description: 'Air leak on the trailer brake line. Cannot build pressure.',
      }),
    );

    const rows = await incidentsForTenant();
    expect(rows.length).toBe(before + 1);
    const created = rows[rows.length - 1];

    expect(created.category).toBe('MECHANICAL');
    expect(created.notes).toContain('Vehicle Breakdown');
    expect(result.success).toBe(true);
  }, 30_000);

  it('rejects a missing severity without writing anything', async () => {
    emitSpy.mockReset();
    const before = (await incidentsForTenant()).length;

    const result = await submitIncidentReport(
      null,
      form({
        type: 'ACCIDENT',
        severity: '',
        location: '',
        description: 'Something happened that is long enough to pass the length check.',
      }),
    );

    expect(result.success).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect((await incidentsForTenant()).length).toBe(before);
    expect(emitSpy).not.toHaveBeenCalled();
  }, 30_000);
});
