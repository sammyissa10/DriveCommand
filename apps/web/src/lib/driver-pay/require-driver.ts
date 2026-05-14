/**
 * Shared auth helper for driver-scoped /api/driver-pay/me/* routes.
 *
 * Supports dual authentication:
 *   1. Supabase cookie session (web browser requests)
 *   2. Bearer token (mobile app requests via validateMobileToken)
 *
 * Usage in a route handler:
 *   const result = await requireDriverContext(req);
 *   if ('error' in result) return result.error;
 *   const { session, driver, getDb } = result;
 *
 * For mobile, all DB queries MUST be wrapped in getDb() transaction to bypass RLS.
 * For web, getDb() returns the tenant-scoped prisma client (RLS via middleware).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { UserRole } from '@/lib/auth/roles';
import { prisma as globalPrisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { PrismaClient } from '@/generated/prisma';

export interface DriverAuthContext {
  userId: string;
  tenantId: string;
  role: string;
}

export type DriverContextResult =
  | { error: NextResponse }
  | {
      session: DriverAuthContext;
      /** Driver id + tenantId (tenantId sourced from session for convenience). */
      driver: { id: string; tenantId: string };
      /** True when request came in via Bearer token (mobile). Use this to decide bypass_rls. */
      isMobile: boolean;
      /**
       * Get a tenant-scoped Prisma client.
       * Web: returns the RLS-scoped client from middleware.
       * Mobile: returns the global prisma client (bypass RLS via explicit tenantId filters).
       */
      getPrisma: () => Promise<PrismaClient>;
      /**
       * Run a callback inside a bypass_rls transaction.
       * Use this for mobile requests to safely query the database.
       * Web requests can use getPrisma() directly.
       */
      withBypassRls: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
    };

/**
 * Authenticate the request as a DRIVER and look up their CarrierDriver record.
 *
 * Tries Supabase cookie session first; falls back to Bearer token for mobile.
 * Returns { error } if not authenticated, not a driver, or no CarrierDriver record.
 */
export async function requireDriverContext(req: NextRequest): Promise<DriverContextResult> {
  let session: DriverAuthContext | null = null;
  let isMobile = false;

  // 1. Try Supabase cookie session (web)
  const cookieSession = await getSession();
  if (cookieSession) {
    const role = cookieSession.role.toUpperCase();
    if (role !== UserRole.DRIVER) {
      return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
    }
    session = {
      userId: cookieSession.userId,
      tenantId: cookieSession.tenantId,
      role: cookieSession.role,
    };
  } else {
    // 2. Try Bearer token (mobile)
    const mobileAuth = await validateMobileToken(req);
    if (!mobileAuth) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    const role = (mobileAuth.role as string).toUpperCase();
    if (role !== UserRole.DRIVER) {
      return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
    }
    session = {
      userId: mobileAuth.userId,
      tenantId: mobileAuth.tenantId,
      role: mobileAuth.role as string,
    };
    isMobile = true;
  }

  const capturedSession = session;

  // 3. Helpers for consumers
  const getPrisma = async (): Promise<PrismaClient> => {
    if (isMobile) {
      return globalPrisma as unknown as PrismaClient;
    }
    return getTenantPrisma() as unknown as Promise<PrismaClient>;
  };

  const withBypassRls = <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => {
    return (globalPrisma as unknown as PrismaClient).$transaction(async (tx) => {
      await (tx as unknown as { $executeRaw: (tpl: TemplateStringsArray) => Promise<unknown> })
        .$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return fn(tx as unknown as PrismaClient);
    }, TX_OPTIONS);
  };

  // 4. Look up CarrierDriver record
  // Use bypass_rls for mobile; tenant-scoped client for web
  // Note: CarrierDriver uses orgId (not tenantId) as the tenant FK column.
  // We select only id here; tenant isolation is enforced via session.tenantId in WHERE clauses.
  let driver: { id: string } | null;

  if (isMobile) {
    driver = await withBypassRls((tx) =>
      tx.carrierDriver.findFirst({
        where: { userId: capturedSession.userId },
        select: { id: true },
      }),
    );
  } else {
    const db = await getTenantPrisma() as unknown as PrismaClient;
    driver = await db.carrierDriver.findFirst({
      where: { userId: capturedSession.userId },
      select: { id: true },
    });
  }

  if (!driver) {
    return { error: NextResponse.json({ error: 'Driver record not found.' }, { status: 404 }) };
  }

  // Wrap driver with tenantId from session for convenience (routes need both)
  const driverWithTenant = { id: driver.id, tenantId: capturedSession.tenantId };

  return {
    session: capturedSession,
    driver: driverWithTenant,
    isMobile,
    getPrisma,
    withBypassRls,
  };
}
