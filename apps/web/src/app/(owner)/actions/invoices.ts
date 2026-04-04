'use server';

import type { ActionState } from '@drivecommand/types'

import { requireRole, requireAuth, requirePermission } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { invoiceCreateSchema, invoiceUpdateSchema } from '@drivecommand/validation';
import { Prisma, InvoiceStatus } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Decimal = Prisma.Decimal;

/**
 * Create a new invoice with line items.
 */
export async function createInvoice(prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  await requirePermission('canViewInvoices');

  // Parse items from JSON hidden field
  let parsedItems: Array<{ description: string; quantity: number; unitPrice: number; itemType?: string; unitType?: string }> = [];
  try {
    const itemsJson = formData.get('itemsJson') as string;
    parsedItems = JSON.parse(itemsJson || '[]');
  } catch {
    return { error: { items: ['Invalid line items data'] } };
  }

  const rawData = {
    customerId: (formData.get('customerId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    loadId: (formData.get('loadId') as string) || '',
    invoiceNumber: formData.get('invoiceNumber') as string,
    tax: formData.get('tax') as string,
    status: (formData.get('status') as string) || 'DRAFT',
    issueDate: formData.get('issueDate') as string,
    dueDate: formData.get('dueDate') as string,
    notes: (formData.get('notes') as string) || '',
    bolNumber: (formData.get('bolNumber') as string) || '',
    proNumber: (formData.get('proNumber') as string) || '',
    poNumber: (formData.get('poNumber') as string) || '',
    commodity: (formData.get('commodity') as string) || '',
    weightLbs: formData.get('weightLbs') as string,
    pieces: formData.get('pieces') as string,
    loadedMiles: formData.get('loadedMiles') as string,
    items: parsedItems,
  };

  const result = invoiceCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const userId = await requireAuth();
  const prisma = await getTenantPrisma();

  // Calculate amounts using Decimal.js (never floating point)
  const itemsWithAmounts = result.data.items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const amount = item.unitType === 'PERCENT'
      ? qty.div(100).mul(price)
      : qty.mul(price);
    return { ...item, amount };
  });

  const subtotal = itemsWithAmounts.reduce(
    (sum, item) => sum.add(item.amount),
    new Decimal(0)
  );
  const tax = new Decimal(result.data.tax);
  const totalAmount = subtotal.add(tax);

  let createdId: string;

  try {
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        customerId: result.data.customerId || null,
        routeId: result.data.routeId || null,
        loadId: result.data.loadId || null,
        invoiceNumber: result.data.invoiceNumber,
        amount: subtotal,
        tax,
        totalAmount,
        status: result.data.status as InvoiceStatus,
        issueDate: new Date(result.data.issueDate),
        dueDate: new Date(result.data.dueDate),
        paidDate: result.data.status === 'PAID' ? new Date() : null,
        notes: result.data.notes || null,
        bolNumber: (formData.get('bolNumber') as string) || null,
        proNumber: (formData.get('proNumber') as string) || null,
        poNumber: (formData.get('poNumber') as string) || null,
        commodity: (formData.get('commodity') as string) || null,
        weightLbs: formData.get('weightLbs') ? parseInt(formData.get('weightLbs') as string) || null : null,
        pieces: formData.get('pieces') ? parseInt(formData.get('pieces') as string) || null : null,
        loadedMiles: formData.get('loadedMiles') ? new Decimal(formData.get('loadedMiles') as string) : null,
        createdById: userId,
        updatedById: userId,
        items: {
          create: itemsWithAmounts.map((item) => ({
            tenantId,
            description: item.description,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            amount: item.amount,
            itemType: (item.itemType as any) || 'OTHER',
            unitType: (item.unitType as any) || 'FLAT',
          })),
        },
      },
    });
    createdId = invoice.id;
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: { invoiceNumber: ['An invoice with this number already exists'] } };
    }
    return { error: 'Failed to create invoice. Please try again.' };
  }

  revalidatePath('/invoices');
  revalidatePath('/loads');
  redirect(`/invoices/${createdId}`);
}

/**
 * Update an existing invoice.
 */
export async function updateInvoice(id: string, prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  await requirePermission('canViewInvoices');

  let parsedItems: Array<{ description: string; quantity: number; unitPrice: number; itemType?: string; unitType?: string }> = [];
  try {
    const itemsJson = formData.get('itemsJson') as string;
    parsedItems = JSON.parse(itemsJson || '[]');
  } catch {
    return { error: { items: ['Invalid line items data'] } };
  }

  const rawData = {
    customerId: (formData.get('customerId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    loadId: (formData.get('loadId') as string) || '',
    invoiceNumber: formData.get('invoiceNumber') as string,
    tax: formData.get('tax') as string,
    status: (formData.get('status') as string) || 'DRAFT',
    issueDate: formData.get('issueDate') as string,
    dueDate: formData.get('dueDate') as string,
    notes: (formData.get('notes') as string) || '',
    bolNumber: (formData.get('bolNumber') as string) || '',
    proNumber: (formData.get('proNumber') as string) || '',
    poNumber: (formData.get('poNumber') as string) || '',
    commodity: (formData.get('commodity') as string) || '',
    weightLbs: formData.get('weightLbs') as string,
    pieces: formData.get('pieces') as string,
    loadedMiles: formData.get('loadedMiles') as string,
    items: parsedItems,
  };

  const result = invoiceUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const userId = await requireAuth();
  const prisma = await getTenantPrisma();

  const itemsWithAmounts = result.data.items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const amount = item.unitType === 'PERCENT'
      ? qty.div(100).mul(price)
      : qty.mul(price);
    return { ...item, amount };
  });

  const subtotal = itemsWithAmounts.reduce(
    (sum, item) => sum.add(item.amount),
    new Decimal(0)
  );
  const tax = new Decimal(result.data.tax);
  const totalAmount = subtotal.add(tax);

  try {
    await prisma.$transaction(async (tx) => {
      // Delete existing items and recreate
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.invoice.update({
        where: { id },
        data: {
          customerId: result.data.customerId || null,
          routeId: result.data.routeId || null,
          loadId: result.data.loadId || null,
          invoiceNumber: result.data.invoiceNumber,
          amount: subtotal,
          tax,
          totalAmount,
          status: result.data.status as InvoiceStatus,
          issueDate: new Date(result.data.issueDate),
          dueDate: new Date(result.data.dueDate),
          paidDate: result.data.status === 'PAID' ? new Date() : null,
          notes: result.data.notes || null,
          bolNumber: (formData.get('bolNumber') as string) || null,
          proNumber: (formData.get('proNumber') as string) || null,
          poNumber: (formData.get('poNumber') as string) || null,
          commodity: (formData.get('commodity') as string) || null,
          weightLbs: formData.get('weightLbs') ? parseInt(formData.get('weightLbs') as string) || null : null,
          pieces: formData.get('pieces') ? parseInt(formData.get('pieces') as string) || null : null,
          loadedMiles: formData.get('loadedMiles') ? new Decimal(formData.get('loadedMiles') as string) : null,
          updatedById: userId,
          items: {
            create: itemsWithAmounts.map((item) => ({
              tenantId,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              amount: item.amount,
              itemType: (item.itemType as any) || 'OTHER',
              unitType: (item.unitType as any) || 'FLAT',
            })),
          },
        },
      });
    }, TX_OPTIONS);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: { invoiceNumber: ['An invoice with this number already exists'] } };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Invoice not found.' };
    }
    return { error: 'Failed to update invoice. Please try again.' };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${id}`);
}

/**
 * Mark a SENT invoice as PAID.
 */
export async function markInvoicePaid(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  await requirePermission('canViewInvoices');

  const prisma = await getTenantPrisma();

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) {
      return { error: 'Invoice not found.' };
    }
    if (invoice.status !== 'SENT') {
      return { error: 'Only SENT invoices can be marked as paid.' };
    }
    await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paidDate: new Date(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Invoice not found.' };
    }
    return { error: 'Failed to mark invoice as paid.' };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${id}`);
}

/**
 * Delete a draft invoice.
 */
export async function deleteInvoice(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  await requirePermission('canViewInvoices');

  const prisma = await getTenantPrisma();

  try {
    // Only allow deletion of DRAFT invoices
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) {
      return { error: 'Invoice not found.' };
    }
    if (invoice.status !== 'DRAFT') {
      return { error: 'Only draft invoices can be archived.' };
    }
    await prisma.invoice.update({ where: { id }, data: { archivedAt: new Date() } });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Invoice not found.' };
    }
    return { error: 'Failed to archive invoice.' };
  }

  revalidatePath('/invoices');
  redirect('/invoices');
}
