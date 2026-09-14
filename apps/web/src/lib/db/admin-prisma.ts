import { setDefaultResultOrder } from 'dns';
// Force IPv4 DNS resolution — same reason as prisma.ts: Vercel iad1 can't
// reach Supabase via IPv6. Calling this twice (once per module) is harmless;
// setDefaultResultOrder is idempotent.
setDefaultResultOrder('ipv4first');

import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { prisma } from './prisma';
import { logger } from '@/lib/logger';
import type { AdminReason } from './admin-reasons';

/**
 * quick-600 (B5) — the privileged admin connection.
 *
 * SEPARATE MODULE, DELIBERATELY, rather than an addition to `prisma.ts`: it
 * keeps the tenant module unchanged, and it makes the import scan in
 * `tests/security/admin-connection-allowlist.test.ts` trivially precise — one
 * module path to grep for, instead of a named-export search over a file most
 * of the app already imports.
 *
 * ─── THE NOT-LIST ────────────────────────────────────────────────────────
 *
 * This client:
 *   - does NOT set, read or clear `app.current_tenant_id`;
 *   - does NOT apply `withTenantRLS` or any tenant extension;
 *   - must NEVER be reachable from a request path that already has a tenant —
 *     if the tenant is in hand, the call belongs on `getTenantPrismaForOrg`,
 *     and THE ALLOWLIST IS WHAT ENFORCES THAT, not this sentence. A comment
 *     asserting an invariant is not evidence the invariant holds
 *     (quick-547/548 — CLAUDE.md);
 *   - is NOT a general escape hatch for a query that happens to be failing: a
 *     failing query under `app_user` is a policy or grant finding to report,
 *     never a reason to escalate to this connection.
 *
 * ─── WHY THE TENANT-GUC CONNECT INITIALISER IS NOT COPIED ────────────────
 *
 * `prisma.ts`'s `pool.on('connect', ...)` resets `app.current_tenant_id` to
 * `''` on every new physical connection so a stale tenant id from a prior
 * worker can never leak into the first query on a fresh one. A BYPASSING
 * connection has no use for a tenant GUC at all — `app_admin` ignores every
 * RLS policy regardless of what any GUC says — and copying the initialiser
 * here would make the two pools LOOK interchangeable, which is precisely the
 * appearance this module exists to prevent. Do not "fix the inconsistency"
 * by adding it back.
 *
 * ─── CAPACITY DECISION ────────────────────────────────────────────────────
 *
 * Both pools are `max: 1`. A warm lambda that touches ANY admin path draws
 * TWO Supabase pooler slots instead of one for the lifetime of that warm
 * instance — this pool and `prisma.ts`'s. `max_connections` is 60 on both
 * staging and production (Facts §5). This pool is instantiated LAZILY, on
 * the first `getAdminDb()` call in a given process, so a lambda that never
 * touches an admin path still draws exactly one slot, as today. Taken here
 * as an explicit decision, not discovered later as a side effect.
 */

const globalForAdminPrisma = globalThis as unknown as {
  adminPool?: Pool;
  adminPrismaClient?: PrismaClient;
};

function getAdminPool(): Pool {
  if (globalForAdminPrisma.adminPool) return globalForAdminPrisma.adminPool;

  const connectionString = process.env.DATABASE_URL_ADMIN;
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5000),
    // NO `pool.on('connect', ...)` tenant-GUC initialiser here — see header.
  });
  globalForAdminPrisma.adminPool = pool;
  return pool;
}

function getAdminPrismaClient(): PrismaClient {
  if (globalForAdminPrisma.adminPrismaClient) return globalForAdminPrisma.adminPrismaClient;

  const adapter = new PrismaPg(getAdminPool());
  const client = new PrismaClient({ adapter });
  globalForAdminPrisma.adminPrismaClient = client;
  return client;
}

// `adminPrisma` (the client itself) is intentionally NEVER exported from this
// module, under this name or any other — the only way to reach it is
// `getAdminDb(reason)`, below. That is what makes rule 4 of the allowlist
// test ("adminPrisma is not exported or re-exported from any module other
// than admin-prisma.ts") true by construction rather than by a check an edit
// could drop.

// ---------------------------------------------------------------------------
// The two-direction boot guard
// ---------------------------------------------------------------------------
//
// `DB_ROLE_ASSERT` — 'off' (default) | 'warn' | 'enforce'. 'off' skips the
// query entirely (no connection attempt at all — a missing DATABASE_URL_ADMIN
// must not break every request that never touches an admin path). 'warn'
// runs it and logs a failure without throwing. 'enforce' throws.
// `apps/web/.env.staging` sets 'enforce'. Flag-gated per design §3.2's
// explicit requirement that a rollback to `postgres` must not be blocked by
// a hard throw.
//
// `DB_ROLE_EXPECT_TENANT_ROLE` — unset today. Once the `app_user` cutover is
// live, set it to `'app_user'` to arm the STRICT half of the tenant-direction
// check (current_user must equal it AND rolbypassrls must be false). Until
// then only the WEAK half runs: the tenant pool's current_user must simply
// not be `'app_admin'` — the one thing assertable today, while `DATABASE_URL`
// is still `postgres`, and precisely the mistake a naming convention cannot
// catch (DATABASE_URL accidentally pointed at the admin connection string).
//
// Half a guard gives a "privileged" client that silently is not, and a
// "restricted" client that silently is — both directions are checked, always.

const ROLE_SHAPE_QUERY =
  "SELECT current_user AS who, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses";

interface RoleShapeRow {
  who: string;
  bypasses: boolean;
}

let bootGuardPromise: Promise<void> | null = null;

async function runBootGuardOnce(): Promise<void> {
  const mode = process.env.DB_ROLE_ASSERT ?? 'off';
  if (mode === 'off') return;

  const failures: string[] = [];

  // Admin direction — always assertable, pre- and post-cutover.
  try {
    const result = await getAdminPool().query<RoleShapeRow>(ROLE_SHAPE_QUERY);
    const row = result.rows[0];
    if (!row || row.who !== 'app_admin' || row.bypasses !== true) {
      failures.push(
        `admin pool: expected current_user='app_admin' AND rolbypassrls=true, got ` +
          `who=${row?.who ?? '(no row)'} bypasses=${row?.bypasses ?? '(no row)'}`
      );
    }
  } catch (err) {
    failures.push(`admin pool: boot guard query failed: ${(err as Error).message}`);
  }

  // Tenant direction — pre-cutover (weak) always, post-cutover (strict) only
  // when DB_ROLE_EXPECT_TENANT_ROLE is armed.
  try {
    const rows = await prisma.$queryRawUnsafe<RoleShapeRow[]>(ROLE_SHAPE_QUERY);
    const row = rows[0];
    if (!row) {
      failures.push('tenant pool: boot guard query returned no row');
    } else {
      if (row.who === 'app_admin') {
        failures.push(
          "tenant pool: current_user is 'app_admin' — DATABASE_URL is pointed at the admin " +
            'credential. This is exactly the misconfiguration a naming convention cannot catch.'
        );
      }
      const expectTenantRole = process.env.DB_ROLE_EXPECT_TENANT_ROLE;
      if (expectTenantRole) {
        if (row.who !== expectTenantRole || row.bypasses !== false) {
          failures.push(
            `tenant pool (strict, DB_ROLE_EXPECT_TENANT_ROLE='${expectTenantRole}'): expected ` +
              `current_user='${expectTenantRole}' AND rolbypassrls=false, got who=${row.who} ` +
              `bypasses=${row.bypasses}`
          );
        }
      }
    }
  } catch (err) {
    failures.push(`tenant pool: boot guard query failed: ${(err as Error).message}`);
  }

  if (failures.length > 0) {
    const message = `[admin-prisma] boot guard failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`;
    if (mode === 'enforce') {
      throw new Error(message);
    }
    logger.warn('[admin-prisma] boot guard failed (DB_ROLE_ASSERT=warn — not throwing)', {
      failures,
    });
  }
}

/**
 * Memoised once per process. Awaited by `getAdminDb`'s first call, and by
 * `getTenantPrismaForOrg`'s first call in `lib/context/tenant-context.ts`
 * (one added `await` there) — so the tenant-direction half runs on ordinary
 * request traffic too, not only when an admin path happens to fire first.
 */
export function assertRoleBootGuard(): Promise<void> {
  bootGuardPromise ??= runBootGuardOnce();
  return bootGuardPromise;
}

/**
 * The only way to reach the admin connection. `reason` is required and typed
 * over the closed `AdminReason` union (`lib/db/admin-reasons.ts`) — calling
 * this with no argument, or with a string literal that is not a member of
 * that union, is a COMPILE error, not a runtime check.
 *
 * Logs every call at `info` (never `warn` — `logger.warn` fires
 * `Sentry.captureMessage` on every call and would flood Sentry with routine,
 * expected traffic).
 */
export async function getAdminDb(reason: AdminReason): Promise<PrismaClient> {
  await assertRoleBootGuard();
  logger.info('[admin-db] privileged query', { reason });
  return getAdminPrismaClient();
}
