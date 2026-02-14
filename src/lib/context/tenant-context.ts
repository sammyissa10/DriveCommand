import { headers } from 'next/headers';
import { prisma } from '../db/prisma';
import { withTenantRLS } from '../db/extensions/tenant-rls';

/**
 * Extract tenant ID from request headers.
 * Returns null if not found (unauthenticated or no tenant assigned).
 */
export async function getTenantId(): Promise<string | null> {
  const headersList = await headers();
  return headersList.get('x-tenant-id');
}

/**
 * Require tenant ID from request headers.
 * Throws an error if not found — use this in protected routes that require tenant context.
 */
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    throw new Error('Tenant context is required but not found. Ensure proxy.ts is injecting x-tenant-id header.');
  }
  return tenantId;
}

/**
 * Get a tenant-scoped Prisma client for the current request.
 * This client automatically applies RLS filtering to all queries.
 *
 * Use this in API routes and server actions to ensure queries are scoped to the current tenant.
 */
export async function getTenantPrisma() {
  const tenantId = await requireTenantId();
  return prisma.$extends(withTenantRLS(tenantId));
}
