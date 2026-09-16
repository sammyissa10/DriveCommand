import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { prisma, isInsideTransaction, tenantCheckoutStore } from './prisma';
import { withTenantRLS } from './extensions/tenant-rls';
import { withAuditColumns } from './extensions/audit-columns';

/**
 * Create a tenant-scoped Prisma client with full type inference + audit-column injection.
 *
 * Composition order:
 *   1. withTenantRLS(tenantId)  — injects tenantId on every read/write (outer guarantee).
 *   2. withAuditColumns(userId) — injects createdById/updatedById on writes.
 *   3. tenant-checkout-context  — carries tenantId to the connection (quick-627, below).
 *
 * If userId is null/undefined (e.g. system contexts), audit injection is a no-op
 * and callers may still provide explicit createdById/updatedById in args.data.
 *
 * The double cast back to PrismaClient is required for the same reason documented
 * in the original file: Prisma 7's $extends loses model-level type inference, but
 * none of the extensions changes the API surface (all are query-layer interceptors).
 *
 * Backwards compatible: userId is optional (defaults to no injection).
 * Wired by `getTenantPrisma()` in lib/context/tenant-context.ts — it forwards `session?.userId ?? null`
 * from the React-cached getSession() so writes get audit columns automatically.
 *
 * ─── THE CONNECTION HALF (quick-627) ────────────────────────────────────────
 * `withTenantRLS` scopes the Prisma query; the RLS policies read `app.current_tenant_id` on the CONNECTION. That GUC
 * is asserted by `prisma.ts`'s pool at checkout, for the tenant it finds in `tenantCheckoutStore()` — so this client
 * runs every operation inside `store.run({ tenantId })`. The binding belongs to the client OBJECT: a client held across
 * awaits, passed to helpers or used from `after()` still carries its tenant. Two more pieces:
 *
 *   - A top-level `$allOperations` also sees `$queryRaw*` / `$executeRaw*`. `$transaction` is not an operation, so
 *     the returned client is a Proxy that opens the transaction inside the same context (BEGIN is a checkout).
 *   - A non-transactional `findUnique[OrThrow]` is re-issued as `findFirst[OrThrow]`. Prisma's DataLoader batches
 *     same-SHAPE findUnique calls from different callers in one tick into ONE statement dispatched from the first
 *     caller's context; one statement cannot carry two tenants' GUCs, so the second tenant read NULL for a row that
 *     exists (quick-625 §3.2). findFirst is never batched and returns the same row for a unique `where`. Inside a
 *     transaction the batch key is the transaction, and rewriting there would run the read on the base delegate —
 *     outside the transaction — which is why `isInsideTransaction` (a private-field read, guarded) gates it.
 */
export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
  const scoped = prisma.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId ?? null));
  const store = tenantCheckoutStore();

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
              return store.run({ tenantId }, async () => delegate[op](args));
            }
            return store.run({ tenantId }, async () => query(args));
          },
        },
      }),
    ),
  ) as unknown as PrismaClient;

  return new Proxy(extended, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === '$transaction' && typeof value === 'function') {
        return (...args: unknown[]) =>
          store.run({ tenantId }, () => (value as (...a: unknown[]) => unknown).apply(target, args));
      }
      return value;
    },
  });
}
