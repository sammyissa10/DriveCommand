import { PrismaClient } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { withTenantRLS } from './extensions/tenant-rls';

/**
 * Create a tenant-scoped Prisma client with full type inference.
 *
 * Workaround for Prisma 7's $extends type inference issue:
 * Instead of using the extended client's inferred type (which loses model types),
 * we cast it back to PrismaClient. This is safe because withTenantRLS only adds
 * a query middleware (set_config before each query via sequential transaction) —
 * it does not change the client's API surface.
 *
 * Usage:
 *   const db = createTenantClient(tenantId);
 *   const trucks = await db.truck.findMany({ where: { ... } }); // fully typed
 *
 * Why this is safe:
 *   The `withTenantRLS` extension wraps every operation in a sequential transaction
 *   with `set_config('app.current_tenant_id', tenantId)`. It does not add, remove,
 *   or rename any Prisma Client methods. Casting back to `PrismaClient` accurately
 *   represents the runtime API.
 */
export function createTenantClient(tenantId: string): PrismaClient {
  return prisma.$extends(withTenantRLS(tenantId)) as unknown as PrismaClient;
}
