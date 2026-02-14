'use server';

/**
 * Server actions for truck CRUD operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import {
  truckCreateSchema,
  truckUpdateSchema,
  type DocumentMetadata,
} from '@/lib/validations/truck.schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Create a new truck.
 * Requires OWNER or MANAGER role.
 */
export async function createTruck(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    make: formData.get('make') as string,
    model: formData.get('model') as string,
    year: parseInt(formData.get('year') as string, 10),
    vin: formData.get('vin') as string,
    licensePlate: formData.get('licensePlate') as string,
    odometer: parseInt(formData.get('odometer') as string, 10),
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
    };
  }

  // Get tenant ID and create truck via tenant-scoped Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();
  const truck = await prisma.truck.create({
    data: {
      ...result.data,
      tenantId,
    },
  });

  // Revalidate and redirect
  revalidatePath('/trucks');
  redirect(`/trucks/${truck.id}`);
}

/**
 * Update an existing truck.
 * Requires OWNER or MANAGER role.
 */
export async function updateTruck(id: string, prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData: any = {};

  const make = formData.get('make') as string;
  if (make) rawData.make = make;

  const model = formData.get('model') as string;
  if (model) rawData.model = model;

  const year = formData.get('year') as string;
  if (year) rawData.year = parseInt(year, 10);

  const vin = formData.get('vin') as string;
  if (vin) rawData.vin = vin;

  const licensePlate = formData.get('licensePlate') as string;
  if (licensePlate) rawData.licensePlate = licensePlate;

  const odometer = formData.get('odometer') as string;
  if (odometer) rawData.odometer = parseInt(odometer, 10);

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
    };
  }

  // Update truck via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  const truck = await prisma.truck.update({
    where: { id },
    data: result.data,
  });

  // Revalidate and redirect
  revalidatePath('/trucks');
  revalidatePath(`/trucks/${id}`);
  redirect(`/trucks/${truck.id}`);
}

/**
 * Delete a truck.
 * Requires OWNER or MANAGER role.
 */
export async function deleteTruck(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Delete truck via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  await prisma.truck.delete({
    where: { id },
  });

  // Revalidate
  revalidatePath('/trucks');

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
    orderBy: { createdAt: 'desc' },
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
  });
}
