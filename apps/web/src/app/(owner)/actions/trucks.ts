'use server';

import type { ActionState } from '@drivecommand/types'
import { Prisma } from '@/generated/prisma';

/**
 * Server actions for truck CRUD operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';

/**
 * Null-safe FormData string extraction helpers.
 * FormData.get() returns string | File | null. The `as string` cast is a lie —
 * it passes null through, which Zod z.string() rejects with "expected string, received null".
 */
function formString(fd: FormData, key: string): string {
  const val = fd.get(key);
  return typeof val === 'string' ? val : '';
}

function formStringOrUndefined(fd: FormData, key: string): string | undefined {
  const val = fd.get(key);
  if (typeof val !== 'string' || val === '') return undefined;
  return val;
}
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

  // Parse FormData fields using null-safe helpers.
  // formData.get() returns string | File | null — casting `as string` is unsafe.
  const rawData = {
    make: formString(formData, 'make'),
    model: formString(formData, 'model'),
    year: formString(formData, 'year'),
    vin: formString(formData, 'vin'),
    licensePlate: formString(formData, 'licensePlate'),
    odometer: formString(formData, 'odometer'),
  };

  // Build documentMetadata if any document fields are provided
  const registrationNumber = formStringOrUndefined(formData, 'registrationNumber');
  const registrationExpiry = formStringOrUndefined(formData, 'registrationExpiry');
  const insuranceNumber = formStringOrUndefined(formData, 'insuranceNumber');
  const insuranceExpiry = formStringOrUndefined(formData, 'insuranceExpiry');

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
        year: rawData.year,
        vin: rawData.vin,
        licensePlate: rawData.licensePlate,
        odometer: rawData.odometer,
        registrationNumber: registrationNumber ?? '',
        registrationExpiry: registrationExpiry ?? '',
        insuranceNumber: insuranceNumber ?? '',
        insuranceExpiry: insuranceExpiry ?? '',
      },
    };
  }

  // SECURITY: tenantId sourced exclusively from session middleware (x-tenant-id header).
  // Never accepted from client payload. getTenantPrisma() applies RLS scoping.
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
    // Post-commit automation — runs outside the main transaction scope per spec Section 6.5
    try {
      await fireEvent({
        event: 'ON_VEHICLE_CREATE',
        entityData: { ...truck, id: truck.id },
        tenantId,
      });
    } catch (err) {
      logger.error('[createTruck] fireEvent failed', { truckId: truck.id, err });
    }
    truckId = truck.id;

    // Activation tracker — fire outside main try/catch, never propagates
    try {
      await recordActivationEvent(tenantId, 'first_real_truck');
    } catch (err) {
      console.error('[createTruck] activation tracker failed', err);
    }
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
  revalidatePath('/onboarding/welcome');
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

  // Parse FormData fields using null-safe helpers.
  // formData.get() returns string | File | null — casting `as string` is unsafe.
  const rawData: any = {};

  const make = formStringOrUndefined(formData, 'make');
  if (make) rawData.make = make;

  const model = formStringOrUndefined(formData, 'model');
  if (model) rawData.model = model;

  const year = formStringOrUndefined(formData, 'year');
  if (year) rawData.year = year;

  const licensePlate = formStringOrUndefined(formData, 'licensePlate');
  if (licensePlate) rawData.licensePlate = licensePlate;

  const odometer = formStringOrUndefined(formData, 'odometer');
  if (odometer) rawData.odometer = odometer;

  // Build documentMetadata if any document fields are provided
  const registrationNumber = formStringOrUndefined(formData, 'registrationNumber');
  const registrationExpiry = formStringOrUndefined(formData, 'registrationExpiry');
  const insuranceNumber = formStringOrUndefined(formData, 'insuranceNumber');
  const insuranceExpiry = formStringOrUndefined(formData, 'insuranceExpiry');

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
        make: make ?? '',
        model: model ?? '',
        year: year ?? '',
        licensePlate: licensePlate ?? '',
        odometer: odometer ?? '',
        registrationNumber: registrationNumber ?? '',
        registrationExpiry: registrationExpiry ?? '',
        insuranceNumber: insuranceNumber ?? '',
        insuranceExpiry: insuranceExpiry ?? '',
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
