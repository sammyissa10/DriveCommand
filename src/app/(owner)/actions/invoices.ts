'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { invoiceCreateSchema, invoiceUpdateSchema } from '@/lib/validations/invoice.schemas';
import { Prisma } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Decimal = Prisma.Decimal;

/**
 * Create a new invoice with line items.
 */
export async function createInvoice(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse items from JSON hidden field
  let parsedItems: Array<{ description: string; quantity: number; unitPrice: number }> = [];
  try {
    const itemsJson = formData.get('itemsJson') as string;
    parsedItems = JSON.parse(itemsJson || '[]');
  } catch {
    return { error: { items: ['Invalid line items data'] } };
  }

  const rawData = {
    customerId: (formData.get('customerId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    invoiceNumber: formData.get('invoiceNumber') as string,
    tax: formData.get('tax') as string,
    status: (formData.get('status') as string) || 'DRAFT',
    issueDate: formData.get('issueDate') as string,
    dueDate: formData.get('dueDate') as string,
    notes: (formData.get('notes') as string) || '',
    items: parsedItems,
  };

  const result = invoiceCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Calculate amounts using Decimal.js (never floating point)
  const itemsWithAmounts = result.data.items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const amount = qty.mul(price);
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
        invoiceNumber: result.data.invoiceNumber,
        amount: subtotal,
        tax,
        totalAmount,
        status: result.data.status as any,
        issueDate: new Date(result.data.issueDate),
        dueDate: new Date(result.data.dueDate),
        paidDate: result.data.status === 'PAID' ? new Date() : null,
        notes: result.data.notes || null,
        items: {
          create: itemsWithAmounts.map((item) => ({
            tenantId,
            description: item.description,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            amount: item.amount,
          })),
        },
      },
    });
    createdId = invoice.id;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { error: { invoiceNumber: ['An invoice with this number already exists'] } };
    }
    return { error: 'Failed to create invoice. Please try again.' };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${createdId}`);
}

/**
 * Update an existing invoice.
 */
export async function updateInvoice(id: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  let parsedItems: Array<{ description: string; quantity: number; unitPrice: number }> = [];
  try {
    const itemsJson = formData.get('itemsJson') as string;
    parsedItems = JSON.parse(itemsJson || '[]');
  } catch {
    return { error: { items: ['Invalid line items data'] } };
  }

  const rawData = {
    customerId: (formData.get('customerId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    invoiceNumber: formData.get('invoiceNumber') as string,
    tax: formData.get('tax') as string,
    status: (formData.get('status') as string) || 'DRAFT',
    issueDate: formData.get('issueDate') as string,
    dueDate: formData.get('dueDate') as string,
    notes: (formData.get('notes') as string) || '',
    items: parsedItems,
  };

  const result = invoiceUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  const itemsWithAmounts = result.data.items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const amount = qty.mul(price);
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
          invoiceNumber: result.data.invoiceNumber,
          amount: subtotal,
          tax,
          totalAmount,
          status: result.data.status as any,
          issueDate: new Date(result.data.issueDate),
          dueDate: new Date(result.data.dueDate),
          paidDate: result.data.status === 'PAID' ? new Date() : null,
          notes: result.data.notes || null,
          items: {
            create: itemsWithAmounts.map((item) => ({
              tenantId,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              amount: item.amount,
            })),
          },
        },
      });
    }, TX_OPTIONS);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { error: { invoiceNumber: ['An invoice with this number already exists'] } };
    }
    if (error?.code === 'P2025') {
      return { error: 'Invoice not found.' };
    }
    return { error: 'Failed to update invoice. Please try again.' };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${id}`);
}

/**
 * Delete a draft invoice.
 */
export async function deleteInvoice(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    // Only allow deletion of DRAFT invoices
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) {
      return { error: 'Invoice not found.' };
    }
    if (invoice.status !== 'DRAFT') {
      return { error: 'Only draft invoices can be deleted.' };
    }
    await prisma.invoice.delete({ where: { id } });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Invoice not found.' };
    }
    return { error: 'Failed to delete invoice.' };
  }

  revalidatePath('/invoices');
  redirect('/invoices');
}
