'use server';

/**
 * Driver-scoped load server actions — Carrier Ops edition.
 * All actions enforce DRIVER role check and resolve driver identity via
 * carrierDriver.userId = session.userId (NOT from URL/params).
 *
 * CRITICAL SECURITY: No action accepts driverId as input. Identity is
 * resolved server-side from the session cookie.
 */

import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';

// ---------------------------------------------------------------------------
// getMyLoads
// ---------------------------------------------------------------------------

/**
 * Get CarrierLoads linked to the authenticated driver's active dispatches.
 * Returns loads from planned or in_progress dispatches.
 *
 * SECURITY: Filters by carrierDriver.userId = session.userId AND orgId = session.tenantId.
 */
export async function getMyLoads() {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  /**
   * quick-588: tenant-scoped client, not a bypass one. CarrierDriver, Trip
   * and CarrierLoad (plus the nested CarrierStop relation) are all
   * EXEMPT_MODELS, so this swap is receiver-only and the emitted SQL is
   * unchanged. Scoping is still the explicit `orgId: session.tenantId`
   * predicate on every query, gated by requireRole([DRIVER]) + getSession()
   * above — unchanged from before this conversion.
   */
  const tenantPrisma = await getTenantPrisma();

  return tenantPrisma.$transaction(async (tx) => {
    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });

    if (!carrierDriver) return [];

    // Find dispatches for this driver that are active
    const activeDispatches = await tx.trip.findMany({
      where: {
        primaryDriverId: carrierDriver.id,
        orgId: session.tenantId,
        status: { in: ['planned', 'in_progress'] },
      },
      select: { id: true },
    });

    const dispatchIds = activeDispatches.map((d) => d.id);
    if (dispatchIds.length === 0) return [];

    return tx.carrierLoad.findMany({
      where: {
        dispatchId: { in: dispatchIds },
        orgId: session.tenantId,
      },
      include: {
        client: { select: { id: true, name: true } },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            facility: {
              select: { id: true, name: true, city: true, state: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }, TX_OPTIONS);
}
