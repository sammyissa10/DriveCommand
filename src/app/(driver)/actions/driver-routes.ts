'use server';

/**
 * Driver-scoped route server actions.
 * All actions enforce DRIVER role check and filter data by authenticated user's ID.
 * CRITICAL SECURITY: No action accepts driverId or routeId as input — identity resolved from getCurrentUser().
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';

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
    },
    orderBy: {
      scheduledDate: 'asc', // Earliest active route first
    },
  });

  return route;
}
