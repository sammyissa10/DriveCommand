import { setDefaultResultOrder } from 'dns';
// Force IPv4 DNS resolution — Vercel iad1 can't reach Supabase via IPv6
setDefaultResultOrder('ipv4first');

import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { shouldArmTripwire } from './tripwire-arm';

/**
 * TRIPWIRE ARMING (quick-604). Evaluated ONCE at module scope, not per
 * connection. `shouldArmTripwire` arms only when DATABASE_URL names the STAGING
 * project AND TENANT_CONTEXT_TRIPWIRE is exactly `on` — so this is `false` on
 * production by construction, whatever the flag says. See tripwire-arm.ts.
 */
const ARM_TRIPWIRE = shouldArmTripwire(
  process.env.DATABASE_URL,
  process.env.TENANT_CONTEXT_TRIPWIRE,
);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pool: Pool;
  tenantCheckoutStore?: AsyncLocalStorage<{ tenantId: string }>;
};

/**
 * ─── TENANT GUC RE-ASSERTION AT CHECKOUT (quick-627) ─────────────────────────
 *
 * pg-pool ENDS a physical connection on any query error, and its replacement starts at `app.current_tenant_id = ''`
 * (quick-624). A session GUC set once per `getTenantPrisma*()` call therefore did not survive the first caught error,
 * and on a shared connection it was last-writer-wins across concurrent requests (quick-607). So the GUC is asserted
 * where the connection is actually handed out:
 *
 *   1. `createTenantClient` (`tenant-client.ts`) runs every operation, and every `$transaction`, inside
 *      `tenantCheckoutStore().run({ tenantId }, …)`.
 *   2. `TenantCheckoutPool.connect()` reads that store WHEN IT IS CALLED — in the async context of the statement that
 *      needs the connection — and issues `set_config('app.current_tenant_id', <tenant>, false)` on the delivered
 *      client before handing it back. pg's per-client queue guarantees it runs first. `pool.query()` goes through
 *      `this.connect`, and adapter-pg's `startTransaction` calls `pool.connect()`, so autocommit statements and BEGIN
 *      are both covered. NEVER move this to pg-pool's `'acquire'` EVENT: it is emitted from `_pulseQueue`, i.e. in the
 *      context of whichever request RELEASED last — measured wrong-tenant on 13–56 of 64 reads (quick-625 §4).
 *   3. A per-connection cache skips the round trip when the connection is KNOWN to hold the value already, and forgets
 *      on any statement that WRITES the GUC (`TENANT_GUC_WRITE`). Reads do not invalidate (quick-626 §4).
 *
 * WHERE THE MODE LIVES: `TENANT_CHECKOUT_NO_CONTEXT`, just below — `'leave'`. A checkout with no tenant in context (the
 * bare `prisma` client: auth bootstrap, admin-shaped code, bypass transactions) asserts NOTHING and inherits whatever
 * the connection holds, exactly as before this change. `'clear'` would assert '' instead, so a bare statement fails
 * loudly (TC001) rather than inheriting — it costs about two extra cross-region round trips per signed-in request
 * (cache hit rate 49 % against 79 %, quick-626 §1.3) and was declined. The 144 bare statements that need a tenant are
 * enumerated in the query census and are being routed regardless.
 *
 * WHAT THIS RELIES ON, GUARDED BY `tests/security/tenant-checkout-guards.test.ts`:
 *   - Prisma executes each request in the caller's async context. If it ever dispatched from a shared queue, a
 *     checkout would read ANOTHER request's tenant — a wrong-tenant read, not an empty one.
 *   - Prisma's private `__internalParams.transaction` (`isInsideTransaction`), used only by the findUnique rewrite.
 * And, not testable in isolation, stated instead:
 *   - Every GUC write is visible as statement text naming `app.current_tenant_id` (or RESET/DISCARD ALL). A server-side
 *     function calling set_config, or a set_config whose GUC NAME is a bind value, is invisible to the cache. None
 *     exist in `src` today (grep, quick-625 and quick-627).
 *   - The store lives on `globalThis` beside the pool: a module re-evaluation (dev HMR, `vi.resetModules`) must not
 *     leave the persisted pool reading a store no tenant client writes to.
 */
export type TenantCheckoutNoContext = 'leave' | 'clear';
export const TENANT_CHECKOUT_NO_CONTEXT: TenantCheckoutNoContext = 'leave';

/** The re-assertion statement. `scripts/audit/626-cache-hit-rate.ts` counts exactly this text — keep it identical. */
export const SET_TENANT_GUC_SQL = "SELECT set_config('app.current_tenant_id', $1, false)";

/** A statement that WRITES the tenant GUC. A read (`current_setting('app.current_tenant_id')`) does not match. */
export const TENANT_GUC_WRITE =
  /set_config\s*\(\s*'app\.current_tenant_id'|\b(?:set|reset)\s+(?:session\s+|local\s+)?app\.current_tenant_id\b|\b(?:reset|discard)\s+all\b/i;

export function tenantCheckoutStore(): AsyncLocalStorage<{ tenantId: string }> {
  return (globalForPrisma.tenantCheckoutStore ??= new AsyncLocalStorage<{ tenantId: string }>());
}

/**
 * True when a query-extension callback is running inside a batch or interactive transaction. Reads Prisma's PRIVATE
 * `__internalParams.transaction` (7.4.0 sets it before the callback for both kinds). Guarded by
 * `tenant-checkout-guards.test.ts`: if Prisma renames it this silently answers false and the findUnique rewrite would
 * move in-transaction reads off the transaction.
 */
export function isInsideTransaction(rest: unknown): boolean {
  return Boolean((rest as { __internalParams?: { transaction?: unknown } } | undefined)?.__internalParams?.transaction);
}

const KNOWN_GUC = Symbol('tenantGucKnown');
const RAW_QUERY = Symbol('tenantGucRawQuery');
type TrackedClient = PoolClient & { [KNOWN_GUC]?: string; [RAW_QUERY]?: PoolClient['query'] };

/** Wrap a client's `query` once, so any GUC write through it forgets the cached value. */
function trackGucWrites(client: TrackedClient): TrackedClient {
  if (client[RAW_QUERY]) return client;
  const raw = client.query.bind(client) as PoolClient['query'];
  client[RAW_QUERY] = raw;
  client[KNOWN_GUC] = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).query = (...args: any[]) => {
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    if (typeof text === 'string' && TENANT_GUC_WRITE.test(text)) client[KNOWN_GUC] = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (raw as any)(...args);
  };
  return client;
}

type ConnectCallback = (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void;

/**
 * The application pool: a `pg.Pool` whose `connect()` re-asserts the tenant GUC for the tenant in context. Also the
 * home of the tenant-GUC `''` initialiser and the tripwire arm, registered on every pool this builds (the arm stays
 * behind the module-scope `ARM_TRIPWIRE` gate — `tripwire-arming-gate.test.ts` pins that shape).
 */
export function createTenantCheckoutPool(
  config: PoolConfig,
  options: { noContext?: TenantCheckoutNoContext } = {},
): Pool {
  const noContext = options.noContext ?? TENANT_CHECKOUT_NO_CONTEXT;

  class TenantCheckoutPool extends Pool {
    // pg-pool's connect is overloaded (callback | promise); both forms are handled.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect(callback?: any): any {
      // Captured NOW, in the caller's async context — never later.
      const tenantId = tenantCheckoutStore().getStore()?.tenantId;
      const value = tenantId ? tenantId : noContext === 'clear' ? '' : undefined;

      const assertThen = (client: PoolClient, deliver: (err?: Error) => void) => {
        if (value === undefined) return deliver();
        const tracked = trackGucWrites(client as TrackedClient);
        if (tracked[KNOWN_GUC] === value) return deliver();
        // pg-pool REMOVES its idle 'error' listener at checkout and pool.query() attaches its own only after this
        // delivers, so a socket that dies while set_config is in flight would emit 'error' with NO listener — an
        // uncaught exception that killed the process (quick-625 §3.3). Hold one for exactly this window; the query's
        // own rejection carries the failure.
        const onSocketError = () => {};
        client.on('error', onSocketError);
        (tracked[RAW_QUERY] as unknown as (text: string, values: unknown[]) => Promise<unknown>)(SET_TENANT_GUC_SQL, [
          value,
        ]).then(
          () => {
            client.removeListener('error', onSocketError);
            tracked[KNOWN_GUC] = value;
            deliver();
          },
          (err: Error) => {
            client.removeListener('error', onSocketError);
            tracked[KNOWN_GUC] = undefined;
            // Fail closed: evict the connection and fail the checkout rather than hand out a client whose GUC is
            // unknown. pool.query's connect-error branch never releases, so release here.
            client.release(err);
            deliver(err);
          },
        );
      };

      if (typeof callback === 'function') {
        super.connect(((err, client, done) => {
          if (err || !client) return (callback as ConnectCallback)(err, client, done);
          assertThen(client, (e) =>
            e ? (callback as ConnectCallback)(e) : (callback as ConnectCallback)(undefined, client, done),
          );
        }) as ConnectCallback);
        return undefined;
      }
      return new Promise<PoolClient>((resolve, reject) => {
        super.connect(((err, client) => {
          if (err || !client) return reject(err);
          assertThen(client, (e) => (e ? reject(e) : resolve(client)));
        }) as ConnectCallback);
      });
    }
  }

  const pool = new TenantCheckoutPool(config);
  registerConnectInitialiser(pool);
  return pool;
}

/**
 * Initialise the tenant GUC on every new physical connection so a stale value from a prior process/worker can never
 * bleed into the first query of a fresh connection. The checkout re-assertion above overwrites it whenever a tenant is
 * in context.
 */
function registerConnectInitialiser(pool: Pool) {
  pool.on('connect', (client) => {
    // Fire-and-forget: client.query returns a Promise but pg invokes the
    // 'connect' callback synchronously and discards the return value. The
    // statement is autocommit, so no transaction is opened and this cannot
    // deadlock against any outer transaction.
    client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {
      // Log but don't crash — the checkout re-assertion overwrites this value
      // whenever a tenant is in context, so an init failure here is non-fatal.
      console.warn('[prisma] pool connect set_config init failed:', err?.message ?? err);
    });

    // Order matters: the tenant-GUC initialiser above first, the arm second.
    // Session scope (`false`) because Supavisor session mode holds the backend
    // for the connection's life and the flag must outlive each statement.
    // ARM_TRIPWIRE is false on production by construction (see tripwire-arm.ts),
    // so this branch is unreachable there.
    if (ARM_TRIPWIRE) {
      client
        .query("SELECT set_config('app.tenant_context_tripwire', 'on', false)")
        .catch((err) => {
          // An arm failure must never crash a request — exactly as the tenant-GUC
          // init above is caught.
          console.warn('[prisma] tripwire arm failed:', err?.message ?? err);
        });
    }
  });
}

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
 * TENANT GUC (quick-411, quick-627):
 * Every new physical connection is initialised to app.current_tenant_id = '' by
 * the 'connect' handler `createTenantCheckoutPool` registers, so a stale value
 * from a prior process/worker can never bleed into the first query of a fresh
 * connection. The tenant is then asserted at CHECKOUT, for the tenant in
 * context — see the quick-627 block above. `getTenantPrisma*()` no longer issues
 * its own session set_config.
 */
let pool: Pool;
if (globalForPrisma.pool) {
  pool = globalForPrisma.pool;
} else {
  pool = createTenantCheckoutPool({
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
