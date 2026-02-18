'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { loadCreateSchema, loadUpdateSchema, dispatchLoadSchema } from '@/lib/validations/load.schemas';
import { Prisma } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Decimal = Prisma.Decimal;

/**
 * Generate the next load number (LD-NNNN format).
 */
async function generateLoadNumber(prisma: any, tenantId: string): Promise<string> {
  // Find the highest existing load number for this tenant
  const latestLoad = await prisma.load.findFirst({
    where: { tenantId },
    orderBy: { loadNumber: 'desc' },
    select: { loadNumber: true },
  });

  if (!latestLoad) {
    return 'LD-0001';
  }

  // Parse the number from "LD-NNNN" format
  const match = latestLoad.loadNumber.match(/^LD-(\d+)$/);
  if (!match) {
    return 'LD-0001';
  }

  const nextNum = parseInt(match[1], 10) + 1;
  return `LD-${String(nextNum).padStart(4, '0')}`;
}

/**
 * Create a new load.
 */
export async function createLoad(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    customerId: formData.get('customerId') as string,
    origin: formData.get('origin') as string,
    destination: formData.get('destination') as string,
    pickupDate: formData.get('pickupDate') as string,
    deliveryDate: (formData.get('deliveryDate') as string) || '',
    weight: formData.get('weight') as string,
    commodity: (formData.get('commodity') as string) || '',
    rate: formData.get('rate') as string,
    notes: (formData.get('notes') as string) || '',
  };

  const result = loadCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  let createdId: string;

  try {
    const loadNumber = await generateLoadNumber(prisma, tenantId);

    const load = await prisma.load.create({
      data: {
        tenantId,
        loadNumber,
        customerId: result.data.customerId,
        origin: result.data.origin,
        destination: result.data.destination,
        pickupDate: new Date(result.data.pickupDate),
        deliveryDate: result.data.deliveryDate ? new Date(result.data.deliveryDate) : null,
        weight: result.data.weight || null,
        commodity: result.data.commodity || null,
        rate: new Decimal(result.data.rate),
        notes: result.data.notes || null,
      },
    });

    createdId = load.id;
  } catch (error: any) {
    return { error: 'Failed to create load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${createdId}`);
}

/**
 * Update an existing load.
 */
export async function updateLoad(id: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    customerId: formData.get('customerId') as string,
    origin: formData.get('origin') as string,
    destination: formData.get('destination') as string,
    pickupDate: formData.get('pickupDate') as string,
    deliveryDate: (formData.get('deliveryDate') as string) || '',
    weight: formData.get('weight') as string,
    commodity: (formData.get('commodity') as string) || '',
    rate: formData.get('rate') as string,
    notes: (formData.get('notes') as string) || '',
  };

  const result = loadUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  try {
    await prisma.load.update({
      where: { id },
      data: {
        customerId: result.data.customerId,
        origin: result.data.origin,
        destination: result.data.destination,
        pickupDate: new Date(result.data.pickupDate),
        deliveryDate: result.data.deliveryDate ? new Date(result.data.deliveryDate) : null,
        weight: result.data.weight || null,
        commodity: result.data.commodity || null,
        rate: new Decimal(result.data.rate),
        notes: result.data.notes || null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to update load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${id}`);
}

/**
 * Delete a load. Only PENDING or CANCELLED loads can be deleted.
 */
export async function deleteLoad(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }
    if (load.status !== 'PENDING' && load.status !== 'CANCELLED') {
      return { error: 'Only pending or cancelled loads can be deleted.' };
    }
    await prisma.load.delete({ where: { id } });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to delete load.' };
  }

  revalidatePath('/loads');
  redirect('/loads');
}

/**
 * Dispatch a load by assigning a driver and truck. Status moves to DISPATCHED.
 */
export async function dispatchLoad(id: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    driverId: formData.get('driverId') as string,
    truckId: formData.get('truckId') as string,
  };

  const result = dispatchLoadSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }
    if (load.status !== 'PENDING') {
      return { error: 'Only pending loads can be dispatched.' };
    }

    await prisma.load.update({
      where: { id },
      data: {
        driverId: result.data.driverId,
        truckId: result.data.truckId,
        status: 'DISPATCHED',
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to dispatch load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${id}`);
}

// Allowed status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DISPATCHED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['INVOICED', 'CANCELLED'],
};

/**
 * Progress a load's status through the lifecycle.
 */
export async function updateLoadStatus(id: string, newStatus: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }

    const allowedTransitions = STATUS_TRANSITIONS[load.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return { error: `Cannot transition from ${load.status} to ${newStatus}.` };
    }

    await prisma.load.update({
      where: { id },
      data: { status: newStatus as any },
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to update load status. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${id}`);
}
