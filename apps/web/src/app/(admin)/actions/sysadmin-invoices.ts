'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { sendSysAdminInvoice } from '@/lib/email/send-sysadmin-invoice';
import { logger } from '@/lib/logger';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

// ─── Invoice Number Generation ───────────────────────────────

/**
 * Generate the next unique invoice number in SINV-XXXX format.
 * Sequential, globally unique (not tenant-scoped).
 */
export async function generateInvoiceNumber(): Promise<string> {
  const last = await prisma.sysAdminInvoice.findFirst({
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (last) {
    const match = last.invoiceNumber.match(/SINV-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `SINV-${String(next).padStart(4, '0')}`;
}

// ─── Zod Schemas ─────────────────────────────────────────────

const itemSchema = z.object({
  chargeType: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Unit price must be >= 0'),
});

const invoiceInputSchema = z.object({
  tenantId: z.string().uuid('Tenant ID must be a valid UUID'),
  dueDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Due date must be a valid date'),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  isRecurring: z.boolean().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'At least one line item is required'),
});

// ─── CRUD Actions ────────────────────────────────────────────

/**
 * Create a new sysadmin invoice with line items.
 * Status defaults to DRAFT. Issue date = now.
 */
export async function createSysAdminInvoice(data: {
  tenantId: string;
  dueDate: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  isRecurring?: boolean;
  notes?: string;
  items: Array<{ chargeType?: string; description: string; quantity: number; unitPrice: number }>;
}): Promise<{ success: true; invoice: Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const validation = invoiceInputSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message };
    }

    const { tenantId, dueDate, billingPeriodStart, billingPeriodEnd, isRecurring, notes, items } = validation.data;

    const invoiceNumber = await generateInvoiceNumber();

    // Compute subtotal using Decimal.js for precision
    let subtotalDecimal = new Decimal(0);
    const itemsWithAmounts = items.map((item) => {
      const amount = new Decimal(item.quantity).times(item.unitPrice);
      subtotalDecimal = subtotalDecimal.plus(amount);
      return {
        chargeType: item.chargeType ?? null,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        amount: amount.toFixed(2),
      };
    });

    const subtotal = subtotalDecimal.toFixed(2);
    const total = subtotal; // No tax for now

    const invoice = await prisma.sysAdminInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: new Date(dueDate),
        billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : null,
        billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
        isRecurring: isRecurring ?? false,
        subtotal,
        total,
        notes,
        items: {
          create: itemsWithAmounts,
        },
      },
    });

    revalidatePath('/admin/billing');
    return { success: true, invoice };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return { success: false, error: message };
  }
}

/**
 * Get all non-archived sysadmin invoices with tenant info.
 * Optionally filter by tenantId or status.
 */
export async function getSysAdminInvoices(filters?: {
  tenantId?: string;
  status?: string;
}) {
  await requireAdminAccess();

  const where: Record<string, unknown> = { archivedAt: null };
  if (filters?.tenantId) {
    where.tenantId = filters.tenantId;
  }
  if (filters?.status) {
    where.status = filters.status;
  }

  return prisma.sysAdminInvoice.findMany({
    where,
    include: {
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single invoice with all line items and tenant owner email.
 */
export async function getSysAdminInvoiceById(id: string) {
  await requireAdminAccess();

  const invoice = await prisma.sysAdminInvoice.findUnique({
    where: { id },
    include: {
      items: true,
      tenant: { select: { id: true, name: true } },
    },
  });

  if (!invoice) return null;

  const ownerUser = await prisma.user.findFirst({
    where: { tenantId: invoice.tenantId, role: 'OWNER', isActive: true },
    select: { email: true, firstName: true, lastName: true },
  });

  return { ...invoice, ownerUser };
}

/**
 * Update an invoice. Only allowed when status === DRAFT.
 * Deletes existing items and recreates them.
 */
export async function updateSysAdminInvoice(
  id: string,
  data: {
    dueDate: string;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    isRecurring?: boolean;
    notes?: string;
    items: Array<{ chargeType?: string; description: string; quantity: number; unitPrice: number }>;
  }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const invoice = await prisma.sysAdminInvoice.findUnique({ where: { id } });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status !== 'DRAFT') {
      return { success: false, error: 'Cannot edit a sent or paid invoice' };
    }

    const updateSchema = z.object({
      dueDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Due date must be a valid date'),
      billingPeriodStart: z.string().optional(),
      billingPeriodEnd: z.string().optional(),
      isRecurring: z.boolean().optional(),
      notes: z.string().optional(),
      items: z.array(itemSchema).min(1, 'At least one line item is required'),
    });

    const validation = updateSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message };
    }

    const { dueDate, billingPeriodStart, billingPeriodEnd, isRecurring, notes, items } = validation.data;

    let subtotalDecimal = new Decimal(0);
    const itemsWithAmounts = items.map((item) => {
      const amount = new Decimal(item.quantity).times(item.unitPrice);
      subtotalDecimal = subtotalDecimal.plus(amount);
      return {
        chargeType: item.chargeType ?? null,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        amount: amount.toFixed(2),
      };
    });

    const subtotal = subtotalDecimal.toFixed(2);
    const total = subtotal;

    await prisma.$transaction([
      prisma.sysAdminInvoiceItem.deleteMany({ where: { invoiceId: id } }),
      prisma.sysAdminInvoice.update({
        where: { id },
        data: {
          dueDate: new Date(dueDate),
          billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : null,
          billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
          isRecurring: isRecurring ?? false,
          subtotal,
          total,
          notes,
          items: { create: itemsWithAmounts },
        },
      }),
    ]);

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update invoice';
    return { success: false, error: message };
  }
}

// ─── Status Transitions ──────────────────────────────────────

/**
 * Mark invoice as PAID. Allowed from SENT or OVERDUE.
 */
export async function markInvoicePaid(id: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const invoice = await prisma.sysAdminInvoice.findUnique({ where: { id } });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === 'PAID') return { success: false, error: 'Invoice is already paid' };
    if (invoice.status === 'VOID') return { success: false, error: 'Cannot mark a voided invoice as paid' };

    await prisma.sysAdminInvoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark invoice as paid';
    return { success: false, error: message };
  }
}

/**
 * Void an invoice. Allowed from DRAFT or SENT only.
 */
export async function voidInvoice(id: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const invoice = await prisma.sysAdminInvoice.findUnique({ where: { id } });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === 'PAID') return { success: false, error: 'Cannot void a paid invoice' };
    if (invoice.status === 'VOID') return { success: false, error: 'Invoice is already voided' };

    await prisma.sysAdminInvoice.update({
      where: { id },
      data: { status: 'VOID' },
    });

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to void invoice';
    return { success: false, error: message };
  }
}

/**
 * Soft-delete (archive) an invoice. Only allowed from DRAFT.
 */
export async function archiveInvoice(id: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const invoice = await prisma.sysAdminInvoice.findUnique({ where: { id } });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status !== 'DRAFT') {
      return { success: false, error: 'Only DRAFT invoices can be archived' };
    }

    await prisma.sysAdminInvoice.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to archive invoice';
    return { success: false, error: message };
  }
}

// ─── Batch Operations ────────────────────────────────────────

/**
 * Send a DRAFT invoice to the tenant owner via email.
 * Updates status to SENT first; email failure surfaces as emailWarning, not a failure return.
 */
export async function sendInvoiceAction(
  invoiceId: string
): Promise<{ success: true; emailWarning?: string } | { success: false; error: string }> {
  try {
    await requireAdminAccess();

    const invoice = await prisma.sysAdminInvoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status !== 'DRAFT') {
      return { success: false, error: 'Only DRAFT invoices can be sent. Current status: ' + invoice.status };
    }

    // Update status to SENT before attempting email delivery
    await prisma.sysAdminInvoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT' },
    });

    try {
      const result = await sendSysAdminInvoice(invoiceId);
      if (!result.sent) {
        revalidatePath('/billing');
        return { success: true, emailWarning: result.warning };
      }
    } catch (emailError: unknown) {
      logger.error('[sendInvoiceAction] Email delivery failed:', emailError);
      const message = emailError instanceof Error ? emailError.message : String(emailError);
      revalidatePath('/billing');
      return { success: true, emailWarning: 'Invoice marked as SENT but email delivery failed: ' + message };
    }

    revalidatePath('/billing');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send invoice';
    return { success: false, error: message };
  }
}

/**
 * Transition all SENT invoices past their dueDate to OVERDUE.
 * Called by the nightly cron job (cron handles its own auth bypass).
 */
export async function markOverdueInvoices(): Promise<{ count: number }> {
  await requireAdminAccess();

  const result = await prisma.sysAdminInvoice.updateMany({
    where: {
      status: 'SENT',
      dueDate: { lt: new Date() },
      archivedAt: null,
    },
    data: { status: 'OVERDUE' },
  });

  return { count: result.count };
}
