import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { withTenantRLS } from '../../src/lib/db/extensions/tenant-rls';
import { withAuditColumns } from '../../src/lib/db/extensions/audit-columns';

/**
 * quick-627 — THE ADOPTION CANDIDATE, measured by steps 1 and 2 BEFORE anything in `src` changes.
 *
 * It is quick-625's prototype (`625-tenant-checkout.prototype.ts`) reduced to the one configuration being adopted,
 * written so that the port into `src/lib/db/prisma.ts` + `tenant-client.ts` is a transcription:
 *
 *   - connect-call capture only (the 'acquire' EVENT control is gone — measured wrong in quick-625 §4);
 *   - `onNoContext: 'leave'` (quick-626 §3's measured alternative) — a checkout with no tenant in context asserts
 *     NOTHING, so a bare statement inherits whatever the connection holds, exactly as shipped does today;
 *   - the per-connection cache ON, and invalidated by GUC WRITES only (quick-626 §4: a read naming the GUC forced a
 *     miss in the prototype);
 *   - the socket-error listener held for the assertion window (quick-625 §3.3);
 *   - the non-transactional `findUnique` → `findFirst` rewrite (quick-625 §3.2).
 *
 * Lives in `scripts/audit/` for the same reason the prototype does: it imports `withTenantRLS`, and the fence scans
 * `src` and `tests` only.
 */

export const candidateStore = new AsyncLocalStorage<{ tenantId: string }>();

export type NoContextMode = 'leave' | 'clear';

/** Exactly the statement text the 626 latency harness counts — keep it byte-identical. */
export const SET_TENANT_GUC_SQL = "SELECT set_config('app.current_tenant_id', $1, false)";

/**
 * A statement that WRITES the tenant GUC. Reads (`current_setting('app.current_tenant_id')`) deliberately do not match.
 * `RESET ALL` / `DISCARD ALL` reset every GUC, so they count as writes. Not visible to this: a set_config whose GUC
 * NAME is a bind value, or a server-side function that calls set_config. None exist in `src` (grep, quick-625/627).
 */
export const TENANT_GUC_WRITE =
  /set_config\s*\(\s*'app\.current_tenant_id'|\b(?:set|reset)\s+(?:session\s+|local\s+)?app\.current_tenant_id\b|\b(?:reset|discard)\s+all\b/i;

const KNOWN = Symbol('tenantGucKnown');
const RAW_QUERY = Symbol('tenantGucRawQuery');
type Tracked = PoolClient & { [KNOWN]?: string; [RAW_QUERY]?: PoolClient['query'] };

function track(client: Tracked): Tracked {
  if (client[RAW_QUERY]) return client;
  const raw = client.query.bind(client) as PoolClient['query'];
  client[RAW_QUERY] = raw;
  client[KNOWN] = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).query = (...a: any[]) => {
    const text = typeof a[0] === 'string' ? a[0] : a[0]?.text;
    if (typeof text === 'string' && TENANT_GUC_WRITE.test(text)) client[KNOWN] = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (raw as any)(...a);
  };
  return client;
}

type ConnectCb = (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void;

export function createCandidatePool(
  config: PoolConfig,
  opts: { noContext?: NoContextMode; armTripwire?: boolean; store?: () => AsyncLocalStorage<{ tenantId: string }> } = {},
): Pool {
  const noContext = opts.noContext ?? 'leave';
  const store = opts.store ?? (() => candidateStore);

  class TenantCheckoutPool extends Pool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect(cb?: any): any {
      // Captured NOW, in the caller's async context — never on the 'acquire' event.
      const tenantId = store().getStore()?.tenantId;
      const value = tenantId ? tenantId : noContext === 'clear' ? '' : undefined;

      const assertThen = (client: PoolClient, deliver: (err?: Error) => void) => {
        if (value === undefined) return deliver();
        const tracked = track(client as Tracked);
        if (tracked[KNOWN] === value) return deliver();
        const onSocketError = () => {};
        client.on('error', onSocketError);
        (tracked[RAW_QUERY] as unknown as (t: string, v: unknown[]) => Promise<unknown>)(SET_TENANT_GUC_SQL, [value]).then(
          () => {
            client.removeListener('error', onSocketError);
            tracked[KNOWN] = value;
            deliver();
          },
          (err: Error) => {
            client.removeListener('error', onSocketError);
            tracked[KNOWN] = undefined;
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

  const pool = new TenantCheckoutPool(config);
  pool.on('connect', (client) => {
    client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
    if (opts.armTripwire) client.query("SELECT set_config('app.tenant_context_tripwire', 'on', false)").catch(() => {});
  });
  return pool;
}

export function createCandidateBaseClient(pool: Pool): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

/** The private-field read, isolated so the guard test can pin exactly this function. */
export function isInsideTransaction(rest: unknown): boolean {
  return Boolean((rest as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction);
}

export function createCandidateTenantClient(base: PrismaClient, tenantId: string, userId?: string | null): PrismaClient {
  const scoped = base.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId ?? null));
  const extended = scoped.$extends(
    Prisma.defineExtension((client) =>
      client.$extends({
        name: 'tenant-checkout-context',
        query: {
          async $allOperations({ model, operation, args, query, ...rest }) {
            if (model && (operation === 'findUnique' || operation === 'findUniqueOrThrow') && !isInsideTransaction(rest)) {
              const delegate = (client as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
                model.charAt(0).toLowerCase() + model.slice(1)
              ];
              const op = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
              return candidateStore.run({ tenantId }, async () => delegate[op](args));
            }
            return candidateStore.run({ tenantId }, async () => query(args));
          },
        },
      }),
    ),
  ) as unknown as PrismaClient;

  return new Proxy(extended, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (prop === '$transaction' && typeof v === 'function') {
        return (...a: unknown[]) => candidateStore.run({ tenantId }, () => (v as (...x: unknown[]) => unknown).apply(target, a));
      }
      return v;
    },
  });
}
