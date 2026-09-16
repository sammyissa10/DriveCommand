import { headers } from 'next/headers';
import { PrismaClient } from '../../generated/prisma/client';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { prisma, TX_OPTIONS } from '../db/prisma';
import { createTenantClient } from '../db/tenant-client';
import { assertRoleBootGuard } from '../db/admin-prisma';

/**
 * ─── THE TENANT IDENTITY TRUST BOUNDARY (quick-590) ─────────────────────────
 *
 * The tenant is derived from the AUTHENTICATED SESSION and from nothing else.
 *
 * It used to be read straight off the `x-tenant-id` request header, which was
 * trustworthy only because `middleware.ts:167` overwrites that header — and
 * three earlier returns in middleware never reach that line and never strip the
 * inbound value (`:79` public paths, `:103` unauthenticated `/api/*`, `:124`
 * authenticated-with-no-tenant on `/api`). An account in the third state is
 * created by the product's own sign-up flow, so a forged header selected an
 * arbitrary tenant's rows. Worse, BOTH enforcement layers read the same value:
 * the Prisma filter injected by `withTenantRLS` and the `app.current_tenant_id`
 * GUC that the RLS policies consult. One forged header defeated both at once.
 *
 * The header is now a VETO, never a source. It can cause a request to be
 * rejected; it can never cause a tenant to be selected. Concretely:
 *
 *   - no session                  -> throw (never fall back to the header)
 *   - session with no tenant      -> throw (never fall back to the header)
 *   - header absent               -> use the session tenant
 *   - header === session tenant   -> use the session tenant (the normal path,
 *                                    because middleware sets it to exactly this)
 *   - header !== session tenant   -> log a security event and throw
 *
 * A mismatch is deliberately NOT silently overwritten. Once the header stopped
 * being an input there was no functional need to read it at all, but a request
 * that names a tenant other than its own is the signature of this exact attack,
 * and it is the only place in the stack able to see it. Overwriting would make
 * the attempt indistinguishable from ordinary traffic.
 *
 * SCOPE: this is the fix for every caller at once. `requireTenantId()` has ~90
 * call sites across server actions and pages, all of which read the header
 * before this change. Fixing only `getTenantPrisma()` would have left them.
 *
 * NOT the escape hatch: `getTenantPrismaForOrg(tenantId)` below still takes an
 * explicit tenant, because cron jobs, `/api/mobile/*` (Bearer token, no cookie,
 * no header — DEC-11) and the pre-auth invitation flow have no session to read.
 * Those callers pass a value they have already verified.
 */

/** Thrown when there is no authenticated tenant to act as. */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

/** Thrown when a request names a tenant that is not the session's. */
export class TenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantMismatchError';
  }
}

/**
 * Read `x-tenant-id` for COMPARISON ONLY.
 *
 * Wrapped because `headers()` throws outside a request scope. A missing header
 * store must not break the session-derived path — the header can only ever veto,
 * so failing to read it is safe by construction.
 */
async function readTenantHeaderForComparison(): Promise<string | null> {
  try {
    return (await headers()).get('x-tenant-id');
  } catch {
    return null;
  }
}

/**
 * The single resolver. Session in, tenant id out, or it throws.
 */
async function resolveSessionTenantId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new TenantContextError(
      'Tenant context is required but there is no authenticated session.'
    );
  }

  const sessionTenantId = session.tenantId;
  if (!sessionTenantId) {
    throw new TenantContextError(
      'Tenant context is required but this account has no tenant assigned.'
    );
  }

  const headerTenantId = await readTenantHeaderForComparison();
  if (headerTenantId && headerTenantId !== sessionTenantId) {
    logger.error(
      '[security] x-tenant-id does not match the session tenant — request rejected',
      new TenantMismatchError('x-tenant-id / session tenant mismatch'),
      {
        event: 'tenant_header_mismatch',
        userId: session.userId,
        sessionTenantId,
        requestedTenantId: headerTenantId,
        role: session.role,
      }
    );
    throw new TenantMismatchError(
      'Requested tenant does not match the authenticated session.'
    );
  }

  return sessionTenantId;
}

/**
 * Current tenant id, derived from the authenticated session.
 * Returns null when there is no session or the account has no tenant.
 *
 * A header that disagrees with the session still throws here rather than
 * returning null — a mismatch is an attack signature, not an absence.
 */
export async function getTenantId(): Promise<string | null> {
  try {
    return await resolveSessionTenantId();
  } catch (err) {
    if (err instanceof TenantMismatchError) throw err;
    return null;
  }
}

/**
 * Require the session's tenant id.
 * Throws when unauthenticated, when the account has no tenant, or when the
 * request names a different tenant.
 */
export async function requireTenantId(): Promise<string> {
  return resolveSessionTenantId();
}

/**
 * Get a tenant-scoped Prisma client for the current request.
 * This client automatically applies RLS filtering to all queries.
 * Returns a fully typed PrismaClient (see tenant-client.ts for type safety rationale).
 *
 * Forwards the current session's userId to the audit-columns extension so createdById/updatedById
 * are auto-populated on writes. Pass-through is null for unauthenticated/system contexts.
 *
 * TENANT SOURCE (quick-590): the tenant comes from `requireTenantId()`, which reads
 * the authenticated session and never the request header. See the trust-boundary
 * note at the top of this file. This function throws rather than ever returning an
 * unscoped client, so a caller cannot accidentally hold a client with no filter.
 *
 * TENANT GUC (quick-411 → quick-627): this function no longer writes the GUC itself.
 * It used to fire one session-scope set_config here, ONCE per acquisition, which did
 * not survive pg-pool evicting the connection on a caught error (quick-624) and was
 * last-writer-wins between concurrent requests sharing the connection (quick-607).
 * The returned client now carries its tenant to the pool, which asserts
 * app.current_tenant_id at every CHECKOUT — see the quick-627 block in
 * lib/db/prisma.ts. Consequence worth knowing: a BARE `prisma` statement issued after
 * this call, but before this client has run anything, no longer inherits this tenant
 * from the connection; under onNoContext 'leave' it inherits whatever the previous
 * checkout left. Those bare statements are the census's routing list.
 *
 * The GUC name and its session scope (FALSE) are locked decisions — see
 * .planning/phase-0-revised.md §2. quick-627 kept both; it moved where the write happens.
 *
 * Use this in API routes and server actions to ensure queries are scoped to the current tenant.
 */
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();

  return createTenantClient(tenantId, session?.userId ?? null);
}

/**
 * Get a tenant-scoped Prisma client for an EXPLICIT tenant/org id.
 *
 * Use this in contexts that already know the tenant and have NO request header to
 * read: cron jobs, background tasks, and API routes that resolved the org from the
 * session (e.g. `session.tenantId`). Unlike getTenantPrisma(), it never reads the
 * x-tenant-id request header, so it cannot throw "Tenant context is required"
 * outside a middleware-processed request.
 *
 * Like getTenantPrisma(), the app.current_tenant_id GUC is asserted by the pool at each
 * checkout for the returned client (quick-627), so DB-level RLS policies resolve
 * correctly, and it applies the same withTenantRLS + audit-column extensions via
 * createTenantClient. Pass userId to populate audit
 * columns on writes (omit/null for pure system contexts).
 */
export async function getTenantPrismaForOrg(
  tenantId: string,
  userId?: string | null,
): Promise<PrismaClient> {
  // quick-600 (B5) — memoised once per process; a no-op when DB_ROLE_ASSERT
  // is 'off' (the default today). Runs the tenant-direction half of the
  // two-direction boot guard on ordinary tenant-scoped traffic, not only
  // when an admin path happens to fire first in a given process.
  await assertRoleBootGuard();
  return createTenantClient(tenantId, userId ?? null);
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
