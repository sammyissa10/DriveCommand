import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { withTenantRLS } from '../../src/lib/db/extensions/tenant-rls';
import { withAuditColumns } from '../../src/lib/db/extensions/audit-columns';

/**
 * PROTOTYPE — NOT WIRED TO ANYTHING. Evaluated in docs/audits/guc-checkout-reassertion.md (quick-625).
 *
 * Lives in `scripts/audit/`, not `src`, and is imported only by the quick-625 harnesses beside it: it imports `withTenantRLS`, and `tests/security/tenant-mechanism-fence.test.ts` fences every `src`/`tests` file that does (the wrapper countdown likewise scans `src` only). Keeping it out of both corpora avoids widening either guard for a prototype. The shipped
 * pool (`prisma.ts`), extension (`tenant-rls.ts`) and `getTenantPrisma*()` are untouched.
 *
 * ─── THE QUESTION ──────────────────────────────────────────────────────────────
 * quick-624: pg-pool ENDS a physical connection on any query error; the replacement starts at
 * `app.current_tenant_id = ''` and nothing sets it again. Can the GUC be re-asserted AT CHECKOUT,
 * so that every statement's own checkout carries its tenant, instead of binding per unit of work?
 *
 * ─── WHERE THE TENANT COMES FROM AT CHECKOUT ──────────────────────────────────
 * A pool knows nothing about requests. The tenant is known in exactly one place at call time: the
 * tenant client object, which `createTenantClient(tenantId)` closes over. So:
 *
 *   1. The tenant client runs every operation inside `tenantCheckoutStore.run({ tenantId }, …)`
 *      (a top-level `$allOperations` extension, which also sees raw queries), and wraps
 *      `$transaction` the same way, because opening a transaction is not an operation.
 *   2. The pool overrides `connect()` and reads the store WHEN `connect()` IS CALLED — i.e. in the
 *      async context of the statement that needs the connection — then issues
 *      `set_config('app.current_tenant_id', <tenant | ''>, false)` on the delivered client BEFORE
 *      handing it back. pg's per-client queue guarantees it runs before the caller's statement.
 *      `pool.query()` goes through `this.connect`, and adapter-pg's `startTransaction` calls
 *      `pool.connect()`, so both non-transactional statements and BEGIN are covered.
 *
 * The `'acquire'` EVENT is the obvious place and is WRONG: pg-pool emits it from `_pulseQueue`,
 * which runs in whatever context released or connected last — at `max: 1` under concurrency that
 * is a DIFFERENT REQUEST. `mode: 'acquire-event'` exists only so the harness can measure that.
 *
 * A checkout with NO tenant in context (bare client, admin-shaped code, `tenantRawQuery`'s outer
 * transaction) is set to '' — fail closed, so a bare statement can no longer inherit the previous
 * checkout's tenant (quick-610/621). `onNoContext: 'leave'` keeps today's inheritance, for comparison.
 */

export const tenantCheckoutStore = new AsyncLocalStorage<{ tenantId: string }>();

export type CheckoutMode = 'connect-call' | 'acquire-event' | 'none';

export interface CheckoutPoolOptions {
  mode: CheckoutMode;
  onNoContext?: 'clear' | 'leave';
  armTripwire?: boolean;
  /**
   * Skip the round trip when this physical connection is KNOWN to hold the value already. "Known" is tracked per
   * connection and is FORGOTTEN (→ re-assert next time) whenever any statement on that connection mentions
   * `app.current_tenant_id` — `getTenantPrisma*`'s own session set, a TRUE-scoped set inside a transaction, the
   * pool's '' initialiser — so an in-app writer cannot leave the cache stale. What it cannot see: a GUC write with no
   * statement text naming it (a server-side function calling set_config, `RESET ALL`, `DISCARD ALL`). None exist in
   * `src` today (grep, quick-625); that is a standing invariant the cache would depend on.
   */
  cacheAssertion?: boolean;
}

const KNOWN = Symbol('q625KnownTenantGuc');
const RAW_QUERY = Symbol('q625RawQuery');
type Tracked = PoolClient & { [KNOWN]?: string; [RAW_QUERY]?: PoolClient['query'] };

function track(client: Tracked): Tracked {
  if (client[RAW_QUERY]) return client;
  const raw = client.query.bind(client) as PoolClient['query'];
  client[RAW_QUERY] = raw;
  client[KNOWN] = undefined; // unknown until our own assertion succeeds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).query = (...a: any[]) => {
    const text = typeof a[0] === 'string' ? a[0] : a[0]?.text;
    if (typeof text === 'string' && text.includes('app.current_tenant_id')) client[KNOWN] = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (raw as any)(...a);
  };
  return client;
}

const SET_TENANT = "SELECT set_config('app.current_tenant_id', $1, false)";

type ConnectCb = (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void;

export function createCheckoutPool(config: PoolConfig, opts: CheckoutPoolOptions): Pool {
  const onNoContext = opts.onNoContext ?? 'clear';

  /** The value to assert for the CURRENT async context, or undefined to leave the session alone. */
  const valueHere = (): string | undefined => {
    const t = tenantCheckoutStore.getStore()?.tenantId;
    if (t) return t;
    return onNoContext === 'clear' ? '' : undefined;
  };

  class CheckoutPool extends Pool {
    // pg-pool's connect is overloaded (callback | promise); both forms are handled.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect(cb?: any): any {
      if (opts.mode !== 'connect-call') return super.connect(cb);

      // Captured NOW, in the caller's async context — never later.
      const value = valueHere();

      const assertThen = (client: PoolClient, deliver: (err?: Error) => void) => {
        if (value === undefined) return deliver();
        const tracked = opts.cacheAssertion ? track(client as Tracked) : null;
        if (tracked && tracked[KNOWN] === value) return deliver();
        // pg-pool REMOVES its idle 'error' listener at checkout, and pool.query() only attaches its own after this
        // callback delivers. A socket that dies while set_config is in flight therefore emits 'error' with NO listener,
        // which Node turns into an uncaught exception that kills the process (measured, quick-625 §3.3). Hold a
        // listener for exactly the assertion window; the query's own rejection carries the failure.
        const onSocketError = () => {};
        client.on('error', onSocketError);
        // Our own assertion bypasses the tracker (it would otherwise forget the value it is about to learn).
        const issue = tracked ? tracked[RAW_QUERY]! : client.query.bind(client);
        (issue as (t: string, v: unknown[]) => Promise<unknown>)(SET_TENANT, [value]).then(
          () => {
            client.removeListener('error', onSocketError);
            if (tracked) tracked[KNOWN] = value;
            deliver();
          },
          (err: Error) => {
            client.removeListener('error', onSocketError);
            if (tracked) tracked[KNOWN] = undefined;
            // Fail closed: evict the connection and fail the checkout rather than hand out a client
            // whose GUC is unknown. (pool.query's err branch does not release, so release here.)
            client.release(err);
            deliver(err);
          },
        );
      };

      if (typeof cb === 'function') {
        super.connect(((err, client, done) => {
          if (err || !client) return (cb as ConnectCb)(err, client, done);
          assertThen(client, (e) => (e ? (cb as ConnectCb)(e) : (cb as ConnectCb)(undefined, client, done)));
        }) as ConnectCb);
        return undefined;
      }
      return new Promise<PoolClient>((resolve, reject) => {
        super.connect(((err, client) => {
          if (err || !client) return reject(err);
          assertThen(client, (e) => (e ? reject(e) : resolve(client)));
        }) as ConnectCb);
      });
    }
  }

  const pool = new CheckoutPool(config);

  // Mirrors prisma.ts exactly: '' initialiser, then the tripwire arm.
  pool.on('connect', (client) => {
    client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
    if (opts.armTripwire) client.query("SELECT set_config('app.tenant_context_tripwire', 'on', false)").catch(() => {});
  });

  if (opts.mode === 'acquire-event') {
    pool.on('acquire', (client) => {
      const value = valueHere(); // read in the PULSE context — the defect being measured
      if (value !== undefined) client.query(SET_TENANT, [value]).catch(() => {});
    });
  }

  return pool;
}

export function createCheckoutBaseClient(pool: Pool): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

/**
 * The prototype's `createTenantClient`: same two shipped extensions, plus the context carrier.
 * Returns a Proxy only so `$transaction` (not an operation, so invisible to `$allOperations`) opens
 * its connection inside the tenant's context.
 */
export interface CheckoutTenantClientOptions {
  /**
   * Prisma's DataLoader batches same-SHAPE `findUnique` calls made in one tick — ACROSS CALLERS — and dispatches
   * the batch from the FIRST requester's `process.nextTick`, as ONE statement on ONE checkout. Two tenants cannot
   * share one statement's GUC, so the second tenant's row is filtered out: a silent NULL for a row that exists
   * (measured, quick-625 §3). When true (default), a non-transactional `findUnique[OrThrow]` is re-issued as
   * `findFirst[OrThrow]` with the same args, which the DataLoader never batches. Same result for a unique `where`;
   * the cost is losing same-tick findUnique batching.
   */
  unbatchFindUnique?: boolean;
}

export function createCheckoutTenantClient(
  base: PrismaClient,
  tenantId: string,
  userId?: string | null,
  options: CheckoutTenantClientOptions = {},
): PrismaClient {
  const unbatch = options.unbatchFindUnique ?? true;
  const scoped = base.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId ?? null));

  const extended = scoped.$extends(
    Prisma.defineExtension((client) =>
      client.$extends({
        name: 'tenant-checkout-context',
        query: {
          async $allOperations({ model, operation, args, query, ...rest }) {
            // Private API, used ONLY to decide whether a findUnique can be batched; see quick-607 §1 for its risk.
            const inTx = Boolean((rest as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction);
            if (unbatch && !inTx && model && (operation === 'findUnique' || operation === 'findUniqueOrThrow')) {
              const delegate = (client as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
                model.charAt(0).toLowerCase() + model.slice(1)
              ];
              const op = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
              return tenantCheckoutStore.run({ tenantId }, async () => delegate[op](args));
            }
            return tenantCheckoutStore.run({ tenantId }, async () => query(args));
          },
        },
      }),
    ),
  ) as unknown as PrismaClient;

  return new Proxy(extended, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (prop === '$transaction' && typeof v === 'function') {
        return (...a: unknown[]) => tenantCheckoutStore.run({ tenantId }, () => (v as (...x: unknown[]) => unknown).apply(target, a));
      }
      return v;
    },
  });
}
