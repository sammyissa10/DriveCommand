'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma';
import {
  driverRouteJoinCreateSchema,
  driverRouteJoinUpdateSchema,
} from '@drivecommand/validation';
import { logger } from '@/lib/logger';

const Decimal = Prisma.Decimal;

/**
 * List all DriverRouteJoin entries for a specific route.
 * OWNER/MANAGER/DRIVER read access.
 */
export async function listDriverRouteJoinsByRoute(routeId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
  const prisma = await getTenantPrisma();

  try {
    const joins = await prisma.driverRouteJoin.findMany({
      where: { routeId },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return joins;
  } catch (error) {
    logger.error('Error listing driver route joins by route:', error);
    return [];
  }
}

/**
 * List all DriverRouteJoin entries for a specific driver.
 * OWNER/MANAGER/DRIVER read access.
 */
export async function listDriverRouteJoinsByDriver(driverId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
  const prisma = await getTenantPrisma();

  try {
    const joins = await prisma.driverRouteJoin.findMany({
      where: { driverId },
      include: {
        route: {
          select: {
            id: true,
            name: true,
            origin: true,
            destination: true,
            scheduledDate: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return joins;
  } catch (error) {
    logger.error('Error listing driver route joins by driver:', error);
    return [];
  }
}

/**
 * Create a new DriverRouteJoin entry.
 * OWNER/MANAGER only.
 */
export async function createDriverRouteJoin(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Parse form data
  const rawData = {
    routeId: formData.get('routeId') as string,
    driverId: formData.get('driverId') as string,
    isMainDriver: formData.get('isMainDriver') === 'true',
    paymentMethod: formData.get('paymentMethod') as string,
    fixedAmount: (formData.get('fixedAmount') as string) || undefined,
    hourlyRate: (formData.get('hourlyRate') as string) || undefined,
    numberOfHours: (formData.get('numberOfHours') as string) || undefined,
    perMileRate: (formData.get('perMileRate') as string) || undefined,
    numberOfMiles: (formData.get('numberOfMiles') as string) || undefined,
  };

  // Validate
  const result = driverRouteJoinCreateSchema.safeParse(rawData);

  if (!result.success) {
    return { error: result.error.issues[0]?.message || 'Validation failed' };
  }

  const { routeId, driverId, isMainDriver, paymentMethod } = result.data;

  // Build monetary fields based on paymentMethod
  const fixedAmount =
    paymentMethod === 'FIXED_AMOUNT' && result.data.fixedAmount
      ? new Decimal(result.data.fixedAmount)
      : null;
  const hourlyRate =
    paymentMethod === 'HOURLY' && result.data.hourlyRate
      ? new Decimal(result.data.hourlyRate)
      : null;
  const numberOfHours =
    paymentMethod === 'HOURLY' && result.data.numberOfHours
      ? new Decimal(result.data.numberOfHours)
      : null;
  const perMileRate =
    paymentMethod === 'PER_MILE' && result.data.perMileRate
      ? new Decimal(result.data.perMileRate)
      : null;
  const numberOfMiles =
    paymentMethod === 'PER_MILE' && result.data.numberOfMiles
      ? new Decimal(result.data.numberOfMiles)
      : null;

  try {
    await prisma.driverRouteJoin.create({
      data: {
        tenantId,
        routeId,
        driverId,
        isMainDriver,
        paymentMethod: paymentMethod as any,
        fixedAmount,
        hourlyRate,
        numberOfHours,
        perMileRate,
        numberOfMiles,
      },
    });

    revalidatePath(`/routes/${routeId}`);
    revalidatePath(`/drivers/${driverId}`);

    return { success: true };
  } catch (error: any) {
    // Unique constraint violation: driver already assigned to this route
    if (error?.code === 'P2002') {
      return { error: 'This driver is already assigned to this route' };
    }
    logger.error('Error creating driver route join:', error);
    return { error: 'Failed to create driver assignment' };
  }
}

/**
 * Update an existing DriverRouteJoin entry.
 * OWNER/MANAGER only.
 */
export async function updateDriverRouteJoin(
  joinId: string,
  prevState: any,
  formData: FormData
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  // Parse form data
  const rawData = {
    isMainDriver: formData.get('isMainDriver') === 'true',
    paymentMethod: (formData.get('paymentMethod') as string) || undefined,
    fixedAmount: (formData.get('fixedAmount') as string) || undefined,
    hourlyRate: (formData.get('hourlyRate') as string) || undefined,
    numberOfHours: (formData.get('numberOfHours') as string) || undefined,
    perMileRate: (formData.get('perMileRate') as string) || undefined,
    numberOfMiles: (formData.get('numberOfMiles') as string) || undefined,
  };

  // Validate
  const result = driverRouteJoinUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return { error: result.error.issues[0]?.message || 'Validation failed' };
  }

  try {
    // Fetch existing join to get routeId and driverId for revalidation
    const existingJoin = await prisma.driverRouteJoin.findUnique({
      where: { id: joinId },
      select: { routeId: true, driverId: true },
    });

    if (!existingJoin) {
      return { error: 'Driver assignment not found' };
    }

    const { routeId, driverId } = existingJoin;
    const paymentMethod = result.data.paymentMethod;

    // Build monetary fields based on paymentMethod (only if provided)
    const monetaryFields =
      paymentMethod !== undefined
        ? {
            fixedAmount:
              paymentMethod === 'FIXED_AMOUNT' && result.data.fixedAmount
                ? new Decimal(result.data.fixedAmount)
                : null,
            hourlyRate:
              paymentMethod === 'HOURLY' && result.data.hourlyRate
                ? new Decimal(result.data.hourlyRate)
                : null,
            numberOfHours:
              paymentMethod === 'HOURLY' && result.data.numberOfHours
                ? new Decimal(result.data.numberOfHours)
                : null,
            perMileRate:
              paymentMethod === 'PER_MILE' && result.data.perMileRate
                ? new Decimal(result.data.perMileRate)
                : null,
            numberOfMiles:
              paymentMethod === 'PER_MILE' && result.data.numberOfMiles
                ? new Decimal(result.data.numberOfMiles)
                : null,
          }
        : {};

    await prisma.driverRouteJoin.update({
      where: { id: joinId },
      data: {
        ...(result.data.isMainDriver !== undefined && {
          isMainDriver: result.data.isMainDriver,
        }),
        ...(paymentMethod !== undefined && {
          paymentMethod: paymentMethod as any,
        }),
        ...monetaryFields,
      },
    });

    revalidatePath(`/routes/${routeId}`);
    revalidatePath(`/drivers/${driverId}`);

    return { success: true };
  } catch (error) {
    logger.error('Error updating driver route join:', error);
    return { error: 'Failed to update driver assignment' };
  }
}

/**
 * List all routes where the driver is set as the primary driver via Route.driverId.
 * This covers drivers assigned through the route create/edit form, which is a
 * separate mechanism from DriverRouteJoin records.
 * OWNER/MANAGER/DRIVER read access.
 */
export async function listDriverPrimaryRoutes(driverId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
  const prisma = await getTenantPrisma();

  try {
    const routes = await prisma.route.findMany({
      where: { driverId, archivedAt: null },
      select: {
        id: true,
        name: true,
        origin: true,
        destination: true,
        scheduledDate: true,
        status: true,
      },
      orderBy: { scheduledDate: 'desc' },
    });

    return routes;
  } catch (error) {
    logger.error('Error listing driver primary routes:', error);
    return [];
  }
}

/**
 * Hard delete a DriverRouteJoin entry.
 * OWNER/MANAGER only.
 */
export async function deleteDriverRouteJoin(joinId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  try {
    // Fetch join for path revalidation
    const join = await prisma.driverRouteJoin.findUnique({
      where: { id: joinId },
      select: { routeId: true, driverId: true },
    });

    if (!join) {
      return { error: 'Driver assignment not found' };
    }

    await prisma.driverRouteJoin.delete({
      where: { id: joinId },
    });

    revalidatePath(`/routes/${join.routeId}`);
    revalidatePath(`/drivers/${join.driverId}`);

    return { success: true };
  } catch (error) {
    logger.error('Error deleting driver route join:', error);
    return { error: 'Failed to delete driver assignment' };
  }
}
