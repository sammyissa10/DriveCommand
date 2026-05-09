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
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

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
   * @bypass_rls reason: driver-server-action
   * WHY: Server actions use Supabase session auth, not the RLS-scoped tenant
   *      connection. Carrier Ops tables require bypass_rls for server-side reads.
   * SCOPE: Reads only loads linked to dispatches where carrierDriver.userId = session.userId
   *        AND orgId = session.tenantId. Double-scoped.
   * SAFETY: Gated by requireRole([DRIVER]) + getSession() above.
   */
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });

    if (!carrierDriver) return [];

    // Find dispatches for this driver that are active
    const activeDispatches = await tx.carrierDispatch.findMany({
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
