import { headers } from 'next/headers';
import { PrismaClient } from '../../generated/prisma/client';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '../db/prisma';
import { createTenantClient } from '../db/tenant-client';

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
    throw new Error('Tenant context is required but not found. Ensure middleware.ts is injecting x-tenant-id header.');
  }
  return tenantId;
}

/**
 * Get a tenant-scoped Prisma client for the current request.
 * This client automatically applies RLS filtering to all queries.
 * Returns a fully typed PrismaClient (see tenant-client.ts for type safety rationale).
 *
 * Forwards the current session's userId to the audit-columns extension so createdById/updatedById
 * are auto-populated on writes. Pass-through is null for unauthenticated/system contexts.
 *
 * TENANT GUC (quick-411): Before returning the extended client, fires a session-scope
 * set_config to write the caller's tenantId into app.current_tenant_id on the pooled
 * connection. RLS policies that call current_tenant_id() read this GUC. Uses FALSE
 * (session scope) because Supabase Session Pooler (port 6543) + max:1 pool +
 * single-threaded Vercel workers guarantee no concurrent tenant overlap on a given
 * physical connection. The $executeRawUnsafe runs as a single autocommit statement on
 * the bare prisma client — NOT inside a $transaction — so it cannot deadlock against
 * any outer transaction opened by the caller. See quick-411 plan for full rationale.
 *
 * Use this in API routes and server actions to ensure queries are scoped to the current tenant.
 */
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();

  // Set the tenant GUC for the current pooled connection (session scope, not tx scope).
  // This must run on the bare client before returning the extended client so every
  // subsequent model query on that connection sees the correct current_tenant_id().
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );

  return createTenantClient(tenantId, session?.userId ?? null);
}

/**
 * Execute a callback containing raw SQL queries ($queryRaw / $executeRaw)
 * within a transaction that has the tenant RLS context set.
 *
 * The Prisma RLS extension (withTenantRLS) only intercepts model-level operations
 * ($allModels.$allOperations). Raw queries bypass it, so RLS blocks all rows.
 * This helper wraps raw queries in a transaction that sets app.current_tenant_id first.
 *
 * @param fn - Callback receiving a transaction client to run raw queries on
 * @returns The result of the callback
 */
export async function tenantRawQuery<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const tenantId = await requireTenantId();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    return fn(tx);
  }, TX_OPTIONS);
}
