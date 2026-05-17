import { PrismaClient } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { withTenantRLS } from './extensions/tenant-rls';
import { withAuditColumns } from './extensions/audit-columns';

/**
 * Create a tenant-scoped Prisma client with full type inference + audit-column injection.
 *
 * Composition order:
 *   1. withTenantRLS(tenantId)  — injects tenantId on every read/write (outer guarantee).
 *   2. withAuditColumns(userId) — injects createdById/updatedById on writes.
 *
 * If userId is null/undefined (e.g. system contexts), audit injection is a no-op
 * and callers may still provide explicit createdById/updatedById in args.data.
 *
 * The double cast back to PrismaClient is required for the same reason documented
 * in the original file: Prisma 7's $extends loses model-level type inference, but
 * neither extension changes the API surface (both are query-layer interceptors).
 *
 * Backwards compatible: userId is optional (defaults to no injection).
 * Prompt 3 will wire the actual session userId at the call site.
 */
export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
  return prisma
    .$extends(withTenantRLS(tenantId))
    .$extends(withAuditColumns(userId ?? null)) as unknown as PrismaClient;
}
