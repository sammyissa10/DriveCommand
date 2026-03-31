'use server';

import type { ActionState } from '@drivecommand/types'
import { Prisma } from '@/generated/prisma';

/**
 * Server actions for truck CRUD operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import {
  truckCreateSchema,
  truckUpdateSchema,
  type DocumentMetadata,
} from '@drivecommand/validation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/logger';

/**
 * Create a new truck.
 * Requires OWNER or MANAGER role.
 */
export async function createTruck(prevState: ActionState | null, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields — pass raw strings; Zod preprocess handles conversion
  const rawData = {
    make: formData.get('make') as string,
    model: formData.get('model') as string,
    year: formData.get('year') as string,
    vin: formData.get('vin') as string,
    licensePlate: formData.get('licensePlate') as string,
    odometer: formData.get('odometer') as string,
  };

  // Build documentMetadata if any document fields are provided
  const registrationNumber = formData.get('registrationNumber') as string;
  const registrationExpiry = formData.get('registrationExpiry') as string;
  const insuranceNumber = formData.get('insuranceNumber') as string;
  const insuranceExpiry = formData.get('insuranceExpiry') as string;

  let documentMetadata: DocumentMetadata | undefined;
  if (registrationNumber || registrationExpiry || insuranceNumber || insuranceExpiry) {
    documentMetadata = {
      ...(registrationNumber && { registrationNumber }),
      ...(registrationExpiry && { registrationExpiry }),
      ...(insuranceNumber && { insuranceNumber }),
      ...(insuranceExpiry && { insuranceExpiry }),
    };
  }

  // Validate with Zod schema
  const result = truckCreateSchema.safeParse({
    ...rawData,
    documentMetadata,
  });

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: {
        make: rawData.make,
        model: rawData.model,
        year: formData.get('year') as string,
        vin: rawData.vin,
        licensePlate: rawData.licensePlate,
        odometer: formData.get('odometer') as string,
        registrationNumber: registrationNumber || '',
        registrationExpiry: registrationExpiry || '',
        insuranceNumber: insuranceNumber || '',
        insuranceExpiry: insuranceExpiry || '',
      },
    };
  }

  // Get tenant ID and create truck via tenant-scoped Prisma client
  let truckId: string;
  try {
    const tenantId = await requireTenantId();
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();
    const truck = await prisma.truck.create({
      data: {
        ...result.data,
        tenantId,
        createdById: userId,
        updatedById: userId,
      },
    });
    truckId = truck.id;
  } catch (error: unknown) {
    // Handle Prisma unique constraint violation (P2002) for VIN
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error?.meta?.target;
      if (Array.isArray(target) && target.includes('vin')) {
        return { error: { vin: ['A truck with this VIN already exists'] } };
      }
      return { error: 'A truck with these details already exists. Please check for duplicates.' };
    }
    logger.error('Failed to create truck:', error);
    return { error: 'Failed to create truck. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch (Next.js redirect throws NEXT_REDIRECT internally)
  revalidatePath('/trucks');
  revalidateTag('dashboard-metrics', 'max');
  redirect(`/trucks/${truckId}`);
}

/**
 * Update an existing truck.
 * Requires OWNER or MANAGER role.
 */
export async function updateTruck(id: string, prevState: ActionState | null, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData: any = {};

  const make = formData.get('make') as string;
  if (make) rawData.make = make;

  const model = formData.get('model') as string;
  if (model) rawData.model = model;

  const year = formData.get('year') as string;
  if (year) rawData.year = year;

  const licensePlate = formData.get('licensePlate') as string;
  if (licensePlate) rawData.licensePlate = licensePlate;

  const odometer = formData.get('odometer') as string;
  if (odometer) rawData.odometer = odometer;

  // Build documentMetadata if any document fields are provided
  const registrationNumber = formData.get('registrationNumber') as string;
  const registrationExpiry = formData.get('registrationExpiry') as string;
  const insuranceNumber = formData.get('insuranceNumber') as string;
  const insuranceExpiry = formData.get('insuranceExpiry') as string;

  if (registrationNumber || registrationExpiry || insuranceNumber || insuranceExpiry) {
    rawData.documentMetadata = {
      ...(registrationNumber && { registrationNumber }),
      ...(registrationExpiry && { registrationExpiry }),
      ...(insuranceNumber && { insuranceNumber }),
      ...(insuranceExpiry && { insuranceExpiry }),
    };
  }

  // Validate with Zod schema
  const result = truckUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: {
        make: make || '',
        model: formData.get('model') as string || '',
        year: year || '',
        licensePlate: licensePlate || '',
        odometer: odometer || '',
        registrationNumber: registrationNumber || '',
        registrationExpiry: registrationExpiry || '',
        insuranceNumber: insuranceNumber || '',
        insuranceExpiry: insuranceExpiry || '',
      },
    };
  }

  // Update truck via tenant-scoped Prisma client
  let updatedTruckId: string;
  try {
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();
    const truck = await prisma.truck.update({
      where: { id },
      data: { ...result.data, updatedById: userId },
    });
    updatedTruckId = truck.id;
  } catch (error: unknown) {
    logger.error('Failed to update truck:', error);
    return { error: 'Failed to update truck. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch (Next.js redirect throws NEXT_REDIRECT internally)
  revalidatePath('/trucks');
  revalidatePath(`/trucks/${id}`);
  revalidateTag('dashboard-metrics', 'max');
  redirect(`/trucks/${updatedTruckId}`);
}

/**
 * Delete a truck.
 * Requires OWNER or MANAGER role.
 */
export async function deleteTruck(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Soft-delete truck via tenant-scoped Prisma client (archive instead of hard delete)
  const prisma = await getTenantPrisma();
  await prisma.truck.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  // Revalidate
  revalidatePath('/trucks');
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}

/**
 * List all trucks for the current tenant.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 */
export async function listTrucks() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.truck.findMany({
    where: { archivedAt: null },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      assignedRoutes: {
        where: { status: 'IN_PROGRESS', archivedAt: null },
        select: { id: true, status: true },
      },
      loads: {
        where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] } },
        select: { id: true, status: true },
      },
      scheduledServices: {
        where: { isCompleted: false },
        select: { id: true, baselineDate: true, intervalDays: true, intervalMiles: true, baselineOdometer: true },
      },
      documents: {
        where: { expiryDate: { not: null } },
        select: { id: true, expiryDate: true },
      },
    },
  });
}

/**
 * Toggle manual maintenance flag on a truck.
 * Requires OWNER or MANAGER role.
 */
export async function toggleTruckMaintenance(truckId: string, inMaintenance: boolean) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const userId = await requireAuth();
  const prisma = await getTenantPrisma();
  await prisma.truck.update({
    where: { id: truckId },
    data: { inMaintenance, updatedById: userId },
  });
  revalidatePath('/trucks');
  revalidatePath(`/trucks/${truckId}`);
  revalidatePath(`/trucks/${truckId}/maintenance`);
  revalidateTag('dashboard-metrics', 'max');
  return { success: true };
}

/**
 * List all routes assigned to a specific truck, including archived routes.
 * Sorted most recent first by scheduledDate.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 */
export async function listTruckRoutes(truckId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.route.findMany({
    where: { truckId },
    orderBy: { scheduledDate: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      origin: true,
      destination: true,
      status: true,
      scheduledDate: true,
      archivedAt: true,
    },
  });
}

/**
 * Get a single truck by ID.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Returns null if not found or belongs to different tenant (RLS).
 */
export async function getTruck(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.truck.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      assignedRoutes: {
        where: { status: 'IN_PROGRESS', archivedAt: null },
        select: { id: true, status: true },
      },
      loads: {
        where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] } },
        select: { id: true, status: true },
      },
      scheduledServices: {
        where: { isCompleted: false },
        select: { id: true, baselineDate: true, intervalDays: true, intervalMiles: true, baselineOdometer: true },
      },
      documents: {
        where: { expiryDate: { not: null } },
        select: { id: true, expiryDate: true },
      },
    },
  });
}
