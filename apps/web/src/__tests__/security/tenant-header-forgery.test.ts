/**
 * Tenant identity trust boundary — quick-590.
 *
 * REGRESSION GUARD for the vector described in docs/audits/role-guard-storage-audit.md
 * finding 2. `getTenantPrisma()` used to derive the tenant from the client-supplied
 * `x-tenant-id` header and never compare it to the session. An account in the
 * "authenticated but no tenant" state reaches `/api/*` handlers with its own header
 * intact (middleware.ts:124 returns before the line that overwrites it), so a forged
 * header selected an arbitrary tenant's rows.
 *
 * These assertions were first written INVERTED, asserting the hole, and committed
 * red in 0e1911bc so the vector was demonstrated before any fix existed. That run
 * returned production row ac724a1f-00ab-465a-84be-aede5732d617 belonging to tenant
 * 37c5a354 to a session carrying no tenant at all. They now assert the closed state.
 *
 * ─── HOW THIS FILE IS BUILT ─────────────────────────────────────────────────
 *
 * Two suites, deliberately, because they answer different questions:
 *
 *   1. RESOLVER CONTRACT (always runs, no database). Asserts which tenant id
 *      `getTenantPrisma()` resolves and writes into the `app.current_tenant_id`
 *      GUC. This is the suite that gates the build — `npm test` runs with no
 *      DATABASE_URL, so a DB-dependent assertion would silently skip and protect
 *      nothing. Same trap as the 17 isolation tests, which skip in a default run.
 *
 *   2. LIVE CROSS-TENANT READ (skips without DATABASE_URL). Drives the REAL
 *      resolver and the REAL `withTenantRLS` extension against the REAL database
 *      and asserts that a forged header returns another tenant's row. Read-only:
 *      this file contains no INSERT, UPDATE, DELETE or DDL, and seeds nothing.
 *
 * ─── WHY IT SEEDS NOTHING ───────────────────────────────────────────────────
 *
 * The repo convention (quick-549) is a disposable tenant written to production,
 * because DEC-3 says there is no local database. Phase 0 forbids any production
 * write from these sessions, so this suite instead READS two tenants that already
 * exist and asserts the forged header selects the wrong one. Proving the vector
 * never required creating the tenants — only that two exist and the header picks
 * between them. Tenant ids are resolved at runtime, not hardcoded, so the suite
 * does not rot when the data changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — the two inputs the resolver reads
// ---------------------------------------------------------------------------

/** Value returned by the mocked `headers()` — the attacker-controlled input. */
let forgedHeader: string | null = null;

/** Value returned by the mocked `getSession()` — the authenticated identity. */
let sessionTenantId = '';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(forgedHeader ? { 'x-tenant-id': forgedHeader } : {}),
}));

vi.mock('@/lib/auth/supabase', () => ({
  getSession: async () => ({
    userId: '00000000-0000-4000-8000-00000000dead',
    email: 'orphan-owner@example.test',
    // The sign-up flow creates the auth user with role OWNER *before* the tenant
    // exists (src/app/(auth)/sign-up/actions.tsx:99-100) and patches tenantId only
    // afterwards (:167-170). If provisioning throws (:162) the account stays here
    // permanently. That is the precondition for middleware.ts:124.
    role: 'OWNER',
    tenantId: sessionTenantId,
    isSystemAdmin: false,
    permissions: undefined,
  }),
  requireAuth: async () => '00000000-0000-4000-8000-00000000dead',
  requireRole: async () => 'OWNER',
  requirePermission: async () => undefined,
  isSystemAdmin: async () => false,
  getRole: async () => 'OWNER',
  getCurrentUser: async () => null,
}));

beforeEach(() => {
  forgedHeader = null;
  sessionTenantId = '';
  vi.resetModules();
  // `loadResolver` registers doMocks for these two. They are NOT scoped to the
  // suite that registered them, so without this the live suite below would import
  // the recorder stub instead of the real client and fail with
  // "prisma.$queryRawUnsafe is not a function" — a mocked module masquerading as
  // a missing method.
  vi.doUnmock('@/lib/db/prisma');
  vi.doUnmock('@/lib/db/tenant-client');
});

// ---------------------------------------------------------------------------
// Suite 1 — resolver contract. No database. This is the build gate.
// ---------------------------------------------------------------------------

describe('getTenantPrisma() tenant resolution (no DB — gates the build)', () => {
  /**
   * Loads tenant-context with the `prisma` singleton replaced by a recorder, so we
   * can read back the tenant id the resolver committed to the GUC without opening
   * a connection. `createTenantClient` is stubbed for the same reason — it calls
   * `prisma.$extends`, which needs a real client. What is under test here is the
   * RESOLUTION, not the injection; suite 2 covers injection against real Prisma.
   */
  async function loadResolver() {
    const gucWrites: Array<{ sql: string; params: unknown[] }> = [];
    const tenantClientCalls: Array<{ tenantId: string; userId: string | null }> = [];

    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
          gucWrites.push({ sql, params });
          return 1;
        },
      },
      TX_OPTIONS: { maxWait: 15000, timeout: 30000 },
    }));

    vi.doMock('@/lib/db/tenant-client', () => ({
      createTenantClient: (tenantId: string, userId: string | null) => {
        tenantClientCalls.push({ tenantId, userId });
        return { __scopedTo: tenantId };
      },
    }));

    const mod = await import('@/lib/context/tenant-context');
    return { mod, gucWrites, tenantClientCalls };
  }

  it('a tenantless account cannot borrow a tenant from a forged header', async () => {
    sessionTenantId = ''; // orphaned OWNER — no tenant of their own
    forgedHeader = '73c69018-9047-40d0-9203-631985ca1ccd'; // victim tenant

    const { mod, gucWrites, tenantClientCalls } = await loadResolver();

    // An account with no tenant of its own cannot borrow one from a header.
    await expect(mod.getTenantPrisma()).rejects.toThrow(/no tenant assigned/i);

    // No client was built and no GUC was written — the request never reached
    // the database at all, rather than reaching it scoped to the wrong tenant.
    expect(tenantClientCalls).toHaveLength(0);
    expect(gucWrites).toHaveLength(0);
  });

  it('a header disagreeing with the session is rejected, not honoured', async () => {
    sessionTenantId = '37c5a354-ea02-46d8-a134-a3f552b397f0';
    forgedHeader = '73c69018-9047-40d0-9203-631985ca1ccd';

    const { mod, gucWrites, tenantClientCalls } = await loadResolver();

    await expect(mod.getTenantPrisma()).rejects.toThrow(
      /does not match the authenticated session/i
    );

    // Critically: it is rejected, NOT silently overwritten with the session
    // tenant. A request naming someone else's tenant is an attack signature and
    // must not be served as if it were ordinary traffic.
    expect(tenantClientCalls).toHaveLength(0);
    expect(gucWrites).toHaveLength(0);
  });

  it('resolves the session tenant when the header agrees', async () => {
    sessionTenantId = '37c5a354-ea02-46d8-a134-a3f552b397f0';
    forgedHeader = '37c5a354-ea02-46d8-a134-a3f552b397f0';

    const { mod, gucWrites, tenantClientCalls } = await loadResolver();
    await mod.getTenantPrisma();

    expect(tenantClientCalls[0].tenantId).toBe(sessionTenantId);
    expect(gucWrites[0].params[0]).toBe(sessionTenantId);
    // Locked decision: GUC name and session scope are not this task's to change.
    expect(gucWrites[0].sql).toContain('app.current_tenant_id');
    expect(gucWrites[0].sql).toContain('false');
  });

  it('resolves the session tenant when no header is present at all', async () => {
    sessionTenantId = '37c5a354-ea02-46d8-a134-a3f552b397f0';
    forgedHeader = null;

    const { mod, tenantClientCalls } = await loadResolver();
    await mod.getTenantPrisma();

    expect(tenantClientCalls[0].tenantId).toBe(sessionTenantId);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — live cross-tenant read. Real DB, real extension. READ-ONLY.
// ---------------------------------------------------------------------------

const hasDatabase = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabase)('forged header against the real database (read-only)', () => {
  it('a forged header reads zero rows of the victim tenant', async () => {
    const { prisma } = await import('@/lib/db/prisma');

    // Find two tenants that each own at least one LoadDriverAssignment. That model
    // carries a real `tenantId`, so it is NOT in EXEMPT_MODELS and the extension
    // genuinely injects a filter for it — which is exactly what we are testing.
    const spread = await prisma.$queryRawUnsafe<Array<{ tenant_id: string; n: bigint }>>(
      `SELECT tenant_id::text AS tenant_id, count(*)::int AS n
         FROM load_driver_assignments
        WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY n DESC LIMIT 2`
    );

    if (spread.length < 2) {
      // Stated rather than silently passing: the environment cannot express the
      // assertion. Suite 1 still gates the build.
      console.warn('[quick-590] fewer than 2 tenants own assignments — live vector check skipped');
      return;
    }

    const victim = spread[1].tenant_id;

    sessionTenantId = ''; // orphaned OWNER
    forgedHeader = victim;

    const mod = await import('@/lib/context/tenant-context');

    // Before the fix this returned the victim's rows through the real
    // withTenantRLS extension. Now the resolver refuses to hand back a client at
    // all, so no query is ever built and zero victim rows can be read.
    await expect(mod.getTenantPrisma()).rejects.toThrow(/no tenant assigned/i);

    console.log('[quick-590][LIVE] session tenant =', JSON.stringify(sessionTenantId));
    console.log('[quick-590][LIVE] forged header  =', victim);
    console.log('[quick-590][LIVE] result         = rejected, 0 rows readable');
  });
});
