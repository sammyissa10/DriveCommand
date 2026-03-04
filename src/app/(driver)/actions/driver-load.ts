'use server';

/**
 * Driver-scoped load server actions.
 * All actions enforce DRIVER role check and filter data by authenticated user's ID.
 * CRITICAL SECURITY: No action accepts driverId as input — identity resolved from getCurrentUser().
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';

/**
 * Get the active load assigned to the authenticated driver.
 * Returns the earliest active load (DISPATCHED, PICKED_UP, IN_TRANSIT, or DELIVERED).
 * Returns null if no active load assignment exists.
 *
 * SECURITY: Filters by driverId = user.id from database user record (NEVER from URL/params).
 */
export async function getMyActiveLoad() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant-scoped Prisma client
  const prisma = await getTenantPrisma();

  // Query load assigned to this driver (filter by user.id in WHERE clause)
  const load = await prisma.load.findFirst({
    where: {
      driverId: user.id, // CRITICAL: user.id from database, NOT from parameters
      status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] },
    },
    include: {
      customer: {
        select: { companyName: true },
      },
    },
    orderBy: {
      pickupDate: 'asc', // Earliest active load first
    },
  });

  return load;
}

/**
 * Advance the authenticated driver's load status one step forward.
 * Status progression: DISPATCHED -> PICKED_UP -> IN_TRANSIT -> DELIVERED
 * SECURITY: Verifies load ownership (driverId = user.id) before updating.
 */
export async function advanceLoadStatus(loadId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant-scoped Prisma client
  const prisma = await getTenantPrisma();

  // Find load and verify ownership
  const load = await prisma.load.findFirst({
    where: {
      id: loadId,
      driverId: user.id, // SECURITY: verify the load belongs to this driver
    },
  });

  if (!load) {
    return { error: 'Load not found or not assigned to you' };
  }

  // Define forward-only status progression map
  const STATUS_PROGRESSION: Record<string, string> = {
    DISPATCHED: 'PICKED_UP',
    PICKED_UP: 'IN_TRANSIT',
    IN_TRANSIT: 'DELIVERED',
  };

  const nextStatus = STATUS_PROGRESSION[load.status];
  if (!nextStatus) {
    return { error: 'Cannot advance this load status' };
  }

  // Update load status
  await prisma.load.update({
    where: { id: loadId },
    data: { status: nextStatus as 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' },
  });

  revalidatePath('/my-load');
  return { success: true, newStatus: nextStatus };
}
