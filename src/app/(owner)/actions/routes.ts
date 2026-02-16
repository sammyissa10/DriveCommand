'use server';

/**
 * Server actions for route CRUD operations.
 * All actions enforce OWNER/MANAGER/DRIVER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { routeCreateSchema, routeUpdateSchema } from '@/lib/validations/route.schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Valid status transitions for route state machine.
 * PLANNED -> IN_PROGRESS -> COMPLETED (one-way only).
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
};

/**
 * Create a new route.
 * Requires OWNER or MANAGER role.
 * Validates driver is active and truck exists before creating.
 */
export async function createRoute(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    origin: formData.get('origin') as string,
    destination: formData.get('destination') as string,
    scheduledDate: formData.get('scheduledDate') as string,
    driverId: formData.get('driverId') as string,
    truckId: formData.get('truckId') as string,
    notes: (formData.get('notes') as string) || undefined,
  };

  // Validate with Zod schema
  const result = routeCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const { origin, destination, scheduledDate, driverId, truckId, notes } = result.data;

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  let createdRouteId: string;

  try {
    // Validate driver exists, is active, and has DRIVER role
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return {
        error: {
          driverId: ['Driver not found'],
        },
      };
    }

    if (!driver.isActive) {
      return {
        error: {
          driverId: ['Driver is not active'],
        },
      };
    }

    if (driver.role !== 'DRIVER') {
      return {
        error: {
          driverId: ['Selected user is not a driver'],
        },
      };
    }

    // Validate truck exists
    const truck = await prisma.truck.findUnique({
      where: { id: truckId },
    });

    if (!truck) {
      return {
        error: {
          truckId: ['Truck not found'],
        },
      };
    }

    // Create route with PLANNED status (default)
    const route = await prisma.route.create({
      data: {
        tenantId,
        origin,
        destination,
        scheduledDate: new Date(scheduledDate),
        driverId,
        truckId,
        notes,
      },
    });

    createdRouteId = route.id;
  } catch (error) {
    console.error('Failed to create route:', error);
    return { error: 'Failed to create route. Please try again.' };
  }

  // Revalidate and redirect (outside try/catch to avoid catching NEXT_REDIRECT)
  revalidatePath('/routes');
  redirect(`/routes/${createdRouteId}`);
}

/**
 * Update an existing route.
 * Requires OWNER or MANAGER role.
 * Validates driver is active and truck exists if either is updated.
 */
export async function updateRoute(id: string, prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields (only include non-empty ones)
  const rawData: any = {};

  const origin = formData.get('origin') as string;
  if (origin) rawData.origin = origin;

  const destination = formData.get('destination') as string;
  if (destination) rawData.destination = destination;

  const scheduledDate = formData.get('scheduledDate') as string;
  if (scheduledDate) rawData.scheduledDate = scheduledDate;

  const driverId = formData.get('driverId') as string;
  if (driverId) rawData.driverId = driverId;

  const truckId = formData.get('truckId') as string;
  if (truckId) rawData.truckId = truckId;

  const notes = formData.get('notes') as string;
  if (notes !== null && notes !== undefined) rawData.notes = notes;

  // Validate with Zod schema
  const result = routeUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const prisma = await getTenantPrisma();

  let updatedRouteId: string;

  try {
    // Validate driver if provided
    if (result.data.driverId) {
      const driver = await prisma.user.findUnique({
        where: { id: result.data.driverId },
      });

      if (!driver) {
        return {
          error: {
            driverId: ['Driver not found'],
          },
        };
      }

      if (!driver.isActive) {
        return {
          error: {
            driverId: ['Driver is not active'],
          },
        };
      }

      if (driver.role !== 'DRIVER') {
        return {
          error: {
            driverId: ['Selected user is not a driver'],
          },
        };
      }
    }

    // Validate truck if provided
    if (result.data.truckId) {
      const truck = await prisma.truck.findUnique({
        where: { id: result.data.truckId },
      });

      if (!truck) {
        return {
          error: {
            truckId: ['Truck not found'],
          },
        };
      }
    }

    // Build update data object
    const updateData: any = {};
    if (result.data.origin) updateData.origin = result.data.origin;
    if (result.data.destination) updateData.destination = result.data.destination;
    if (result.data.scheduledDate) updateData.scheduledDate = new Date(result.data.scheduledDate);
    if (result.data.driverId) updateData.driverId = result.data.driverId;
    if (result.data.truckId) updateData.truckId = result.data.truckId;
    if (result.data.notes !== undefined) updateData.notes = result.data.notes;

    // Update route
    const route = await prisma.route.update({
      where: { id },
      data: updateData,
    });

    updatedRouteId = route.id;
  } catch (error) {
    console.error('Failed to update route:', error);
    return { error: 'Failed to update route. Please try again.' };
  }

  // Revalidate and redirect (outside try/catch to avoid catching NEXT_REDIRECT)
  revalidatePath('/routes');
  revalidatePath(`/routes/${id}`);
  redirect(`/routes/${updatedRouteId}`);
}

/**
 * Update route status with state machine validation.
 * Requires OWNER or MANAGER role.
 * Sets completedAt when transitioning to COMPLETED.
 */
export async function updateRouteStatus(routeId: string, newStatus: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Fetch current route
  const route = await prisma.route.findUnique({
    where: { id: routeId },
  });

  if (!route) {
    return { error: 'Route not found' };
  }

  // Validate state transition
  const allowedTransitions = VALID_TRANSITIONS[route.status];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return {
      error: `Invalid status transition from ${route.status} to ${newStatus}`,
    };
  }

  // Build update data
  const updateData: any = {
    status: newStatus as any,
  };

  // Set completedAt when transitioning to COMPLETED
  if (newStatus === 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  // Update route status
  await prisma.route.update({
    where: { id: routeId },
    data: updateData,
  });

  // Revalidate
  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);

  return { success: true };
}

/**
 * Delete a route.
 * Requires OWNER or MANAGER role.
 */
export async function deleteRoute(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  await prisma.route.delete({
    where: { id },
  });

  // Revalidate
  revalidatePath('/routes');

  return { success: true };
}

/**
 * List all routes for the current tenant.
 * Requires OWNER, MANAGER, or DRIVER role.
 * Includes driver and truck data in single query.
 */
export async function listRoutes() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.route.findMany({
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
        },
      },
    },
    orderBy: {
      scheduledDate: 'desc',
    },
  });
}

/**
 * Get a single route by ID.
 * Requires OWNER, MANAGER, or DRIVER role.
 * Includes full driver and truck details.
 * Returns null if not found or belongs to different tenant (RLS).
 */
export async function getRoute(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.route.findUnique({
    where: { id },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          licenseNumber: true,
        },
      },
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
    },
  });
}
