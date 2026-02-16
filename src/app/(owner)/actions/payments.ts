'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma';
import {
  paymentCreateSchema,
  paymentUpdateSchema,
} from '@/lib/validations/payment.schemas';

const Decimal = Prisma.Decimal;

/**
 * Create a new payment for a route.
 * OWNER/MANAGER only.
 */
export async function createPayment(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Parse form data
  const rawData = {
    routeId: formData.get('routeId') as string,
    amount: formData.get('amount') as string,
    status: formData.get('status') as string,
    paidAt: formData.get('paidAt') as string,
    notes: formData.get('notes') as string,
  };

  // Validate
  const result = paymentCreateSchema.safeParse({
    routeId: rawData.routeId,
    amount: rawData.amount,
    status: rawData.status,
    paidAt: rawData.paidAt || undefined,
    notes: rawData.notes || undefined,
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message || 'Validation failed' };
  }

  try {
    // Check route exists and is not COMPLETED
    const route = await prisma.route.findUnique({
      where: { id: result.data.routeId },
      select: { status: true },
    });

    if (!route) {
      return { error: 'Route not found' };
    }

    if (route.status === 'COMPLETED') {
      return { error: 'Cannot add payments to completed routes' };
    }

    // Determine paidAt date
    let paidAtDate: Date | null = null;
    if (result.data.status === 'PAID') {
      if (result.data.paidAt) {
        paidAtDate = new Date(result.data.paidAt);
      } else {
        paidAtDate = new Date();
      }
    }

    // Create payment
    await prisma.routePayment.create({
      data: {
        tenantId,
        routeId: result.data.routeId,
        amount: new Decimal(result.data.amount),
        status: result.data.status,
        paidAt: paidAtDate,
        notes: result.data.notes || null,
      },
    });

    // Revalidate paths
    revalidatePath(`/routes/${result.data.routeId}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Error creating payment:', error);
    return { error: 'Failed to create payment' };
  }
}

/**
 * Update an existing payment.
 * OWNER/MANAGER only.
 */
export async function updatePayment(
  paymentId: string,
  prevState: any,
  formData: FormData
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  // Parse form data
  const rawData = {
    amount: formData.get('amount') as string,
    status: formData.get('status') as string,
    paidAt: formData.get('paidAt') as string,
    notes: formData.get('notes') as string,
  };

  // Validate
  const result = paymentUpdateSchema.safeParse({
    amount: rawData.amount || undefined,
    status: rawData.status || undefined,
    paidAt: rawData.paidAt || undefined,
    notes: rawData.notes || undefined,
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message || 'Validation failed' };
  }

  try {
    // Fetch existing payment
    const payment = await prisma.routePayment.findUnique({
      where: { id: paymentId },
      include: { route: { select: { status: true } } },
    });

    if (!payment) {
      return { error: 'Payment not found' };
    }

    if (payment.deletedAt) {
      return { error: 'Cannot update deleted payment' };
    }

    if (payment.route.status === 'COMPLETED') {
      return { error: 'Cannot update payments for completed routes' };
    }

    // Determine paidAt date
    let paidAtDate: Date | null | undefined = undefined;
    if (result.data.status === 'PAID') {
      if (result.data.paidAt) {
        paidAtDate = new Date(result.data.paidAt);
      } else if (payment.status === 'PENDING') {
        // Status changing from PENDING to PAID, set paidAt to now
        paidAtDate = new Date();
      }
      // else: already PAID, keep existing paidAt
    }

    // Update payment
    await prisma.routePayment.update({
      where: { id: paymentId },
      data: {
        ...(result.data.amount !== undefined && {
          amount: new Decimal(result.data.amount),
        }),
        ...(result.data.status !== undefined && { status: result.data.status }),
        ...(paidAtDate !== undefined && { paidAt: paidAtDate }),
        ...(result.data.notes !== undefined && { notes: result.data.notes }),
      },
    });

    // Revalidate paths
    revalidatePath(`/routes/${payment.routeId}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Error updating payment:', error);
    return { error: 'Failed to update payment' };
  }
}

/**
 * Soft delete a payment.
 * OWNER/MANAGER only.
 */
export async function deletePayment(paymentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  try {
    // Fetch payment
    const payment = await prisma.routePayment.findUnique({
      where: { id: paymentId },
      include: { route: { select: { status: true } } },
    });

    if (!payment) {
      return { error: 'Payment not found' };
    }

    if (payment.route.status === 'COMPLETED') {
      return { error: 'Cannot delete payments from completed routes' };
    }

    // Soft delete
    await prisma.routePayment.update({
      where: { id: paymentId },
      data: { deletedAt: new Date() },
    });

    // Revalidate paths
    revalidatePath(`/routes/${payment.routeId}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Error deleting payment:', error);
    return { error: 'Failed to delete payment' };
  }
}

/**
 * List all payments for a route.
 * OWNER/MANAGER/DRIVER read access.
 */
export async function listPayments(routeId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
  const prisma = await getTenantPrisma();

  try {
    const payments = await prisma.routePayment.findMany({
      where: {
        routeId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments;
  } catch (error) {
    console.error('Error listing payments:', error);
    return [];
  }
}
