'use server';

/**
 * Server actions for maintenance CRUD operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import {
  maintenanceEventCreateSchema,
  scheduledServiceCreateSchema,
} from '@/lib/validations/maintenance.schemas';
import { calculateNextDue } from '@/lib/utils/maintenance-utils';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Create a new maintenance event.
 * Requires OWNER or MANAGER role.
 */
export async function createMaintenanceEvent(
  truckId: string,
  prevState: any,
  formData: FormData
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    serviceType: formData.get('serviceType') as string,
    serviceDate: formData.get('serviceDate') as string,
    odometerAtService: formData.get('odometerAtService') as string,
    cost: formData.get('cost') ? (formData.get('cost') as string) : null,
    provider: formData.get('provider') ? (formData.get('provider') as string) : null,
    notes: formData.get('notes') ? (formData.get('notes') as string) : null,
  };

  // Validate with Zod schema
  const result = maintenanceEventCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  // Get tenant ID and create maintenance event via tenant-scoped Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.maintenanceEvent.create({
    data: {
      ...result.data,
      truckId,
      tenantId,
    },
  });

  // Revalidate and redirect
  revalidatePath(`/trucks/${truckId}/maintenance`);
  redirect(`/trucks/${truckId}/maintenance`);
}

/**
 * List all maintenance events for a truck.
 * Requires OWNER or MANAGER role.
 */
export async function listMaintenanceEvents(truckId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  return prisma.maintenanceEvent.findMany({
    where: { truckId },
    orderBy: { serviceDate: 'desc' },
  });
}

/**
 * Delete a maintenance event.
 * Requires OWNER or MANAGER role.
 */
export async function deleteMaintenanceEvent(id: string, truckId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.maintenanceEvent.delete({
    where: { id },
  });

  // Revalidate
  revalidatePath(`/trucks/${truckId}/maintenance`);

  return { success: true };
}

/**
 * Create a new scheduled service.
 * Requires OWNER or MANAGER role.
 */
export async function createScheduledService(
  truckId: string,
  prevState: any,
  formData: FormData
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    serviceType: formData.get('serviceType') as string,
    intervalDays: formData.get('intervalDays') ? (formData.get('intervalDays') as string) : null,
    intervalMiles: formData.get('intervalMiles')
      ? (formData.get('intervalMiles') as string)
      : null,
    baselineDate: formData.get('baselineDate') as string,
    baselineOdometer: formData.get('baselineOdometer') as string,
    notes: formData.get('notes') ? (formData.get('notes') as string) : null,
  };

  // Validate with Zod schema
  const result = scheduledServiceCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  // Get tenant ID and create scheduled service via tenant-scoped Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.scheduledService.create({
    data: {
      ...result.data,
      truckId,
      tenantId,
    },
  });

  // Revalidate and redirect
  revalidatePath(`/trucks/${truckId}/maintenance`);
  redirect(`/trucks/${truckId}/maintenance`);
}

/**
 * List all active scheduled services for a truck with due status.
 * Requires OWNER or MANAGER role.
 */
export async function listScheduledServices(truckId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Fetch truck odometer for due status calculation
  const truck = await prisma.truck.findUnique({
    where: { id: truckId },
    select: { odometer: true },
  });

  if (!truck) {
    return [];
  }

  // Fetch active scheduled services
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  const schedules = await prisma.scheduledService.findMany({
    where: { truckId, isCompleted: false },
    orderBy: { createdAt: 'desc' },
  });

  // Augment each schedule with due status
  return schedules.map((schedule: any) => ({
    ...schedule,
    dueStatus: calculateNextDue(schedule, truck.odometer),
  }));
}

/**
 * Delete a scheduled service.
 * Requires OWNER or MANAGER role.
 */
export async function deleteScheduledService(id: string, truckId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.scheduledService.delete({
    where: { id },
  });

  // Revalidate
  revalidatePath(`/trucks/${truckId}/maintenance`);

  return { success: true };
}
