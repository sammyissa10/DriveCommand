'use server';

/**
 * Driver-scoped route server actions.
 * All actions enforce DRIVER role check and filter data by authenticated user's ID.
 * CRITICAL SECURITY: No action accepts driverId or routeId as input — identity resolved from getCurrentUser().
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';

/**
 * Get the route assigned to the authenticated driver.
 * Returns the driver's active route (PLANNED or IN_PROGRESS status) with truck, driver, and document details.
 * Returns null if no active route assignment exists.
 *
 * SECURITY: Filters by driverId = user.id from database user record (NEVER from URL/params).
 */
export async function getMyAssignedRoute() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant-scoped Prisma client
  const prisma = await getTenantPrisma();

  // Query route assigned to this driver (filter by user.id in WHERE clause)
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id, // CRITICAL: user.id from database, NOT from parameters
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    include: {
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
          odometer: true,
          documentMetadata: true,
        },
      },
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          licenseNumber: true,
        },
      },
      documents: true,
      stops: { orderBy: { position: 'asc' } },
    },
    orderBy: {
      scheduledDate: 'asc', // Earliest active route first
    },
  });

  return route;
}

/**
 * Mark a route stop as DEPARTED (manual only — geofence exit does NOT trigger this).
 * Stop must be in ARRIVED status and belong to the authenticated driver's active route.
 * SECURITY: Validates stop ownership via route.driverId = user.id.
 */
export async function markStopDeparted(stopId: string) {
  await requireRole([UserRole.DRIVER]);
  const user = await getCurrentUser();
  if (!user) throw new Error('User not found');

  const prisma = await getTenantPrisma();

  // Verify the stop belongs to the driver's route
  const stop = await prisma.routeStop.findFirst({
    where: {
      id: stopId,
      route: {
        driverId: user.id,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
    },
  });

  if (!stop) {
    return { error: 'Stop not found or not assigned to you' };
  }

  if (stop.status !== 'ARRIVED') {
    return { error: 'Stop must be in ARRIVED status to mark as departed' };
  }

  await prisma.routeStop.update({
    where: { id: stopId },
    data: {
      status: 'DEPARTED',
      departedAt: new Date(),
    },
  });

  revalidatePath('/my-route');
  return { success: true };
}
