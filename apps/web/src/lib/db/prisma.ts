import { setDefaultResultOrder } from 'dns';
// Force IPv4 DNS resolution — Vercel iad1 can't reach Supabase via IPv6
setDefaultResultOrder('ipv4first');

import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pool: Pool;
};

/**
 * PostgreSQL connection pool.
 *
 * SINGLETON: preserved on globalThis in ALL environments (dev + production).
 * Vercel serverless functions reuse the module between warm invocations, so
 * globalThis persists within the same worker process lifetime. Without this,
 * every cold-start creates a new Pool causing a slow TCP handshake to Supabase.
 *
 * max: 1 — DATABASE_URL points to Supabase's Session Pooler (port 6543).
 * Session Pooler handles actual connection pooling server-side, so each
 * serverless lambda instance only needs 1 connection slot. With max=5 and many
 * concurrent Vercel lambdas, we risk exhausting Supabase's connection limit.
 *
 * DATABASE_URL (Vercel env var) must use Supabase's pooled connection string:
 *   Port 6543 → Pooled / Session Mode (use for app runtime)
 *   Port 5432 → Direct (bypasses pooler — use for migrations/CLI only)
 * Example: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
 *
 * TENANT GUC INITIALISER (quick-411):
 * The 'connect' handler below fires once per new physical pg connection and
 * initialises app.current_tenant_id to '' (empty string). This prevents stale
 * tenant IDs from a prior process/worker from leaking into the first query of
 * a fresh connection. getTenantPrisma() in lib/context/tenant-context.ts then
 * overwrites this value per-request via a session-scope set_config call before
 * any model query runs. See quick-411 plan for full deadlock-avoidance rationale.
 */
let pool: Pool;
if (globalForPrisma.pool) {
  pool = globalForPrisma.pool;
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    // Release idle PgBouncer session-mode slots after 10 s so warm Vercel
    // instances don't permanently hold one of the 15 pool slots between
    // the dashboard's 60-second polling cycles.
    idleTimeoutMillis: 10000,
    // 5s is right for Vercel, which sits next to Supabase. It is marginal from a
    // developer machine on 5432, where the TLS handshake to us-west-1 can take
    // longer and a terminal script dies with "connection terminated due to
    // connection timeout" before it has run a single query. Overridable by env
    // so scripts can raise it WITHOUT changing what production uses — the
    // default is unchanged and no deployed code sets this variable.
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5000),
  });
  // Initialise the tenant GUC on every new physical connection so a stale value
  // from a prior process/worker can never bleed into the first query of a fresh
  // connection. getTenantPrisma() overwrites this per-request before any model
  // query runs. The 'connect' handler is only registered once per process because
  // we only enter this else-branch on first module load (singleton guard above).
  pool.on('connect', (client) => {
    // Fire-and-forget: client.query returns a Promise but pg invokes the
    // 'connect' callback synchronously and discards the return value. The
    // statement is autocommit, so no transaction is opened and this cannot
    // deadlock against any outer transaction.
    client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {
      // Log but don't crash — getTenantPrisma() overwrites this value anyway,
      // so an init failure here is non-fatal.
      console.warn('[prisma] pool connect set_config init failed:', err?.message ?? err);
    });
  });
  globalForPrisma.pool = pool;
}

// Create Prisma adapter for PostgreSQL
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter (Prisma 7 requirement)
// SINGLETON: same as pool — always preserved on globalThis.
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

globalForPrisma.prisma = prisma;

/**
 * Shared transaction options for all bypass_rls / tenant-context transactions.
 * Raised from defaults (maxWait: 2000, timeout: 5000) to handle bursts of
 * concurrent queries under parallel load (multiple page renders, Playwright tests).
 */
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 } as const;
