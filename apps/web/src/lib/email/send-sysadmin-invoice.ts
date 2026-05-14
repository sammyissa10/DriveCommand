/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 *
 * Note: The tenantId on the dispatcher payload is the BILLED tenant (the recipient),
 * not the SysAdmin sender.
 */

import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/gmail-client';
import React from 'react';
import Decimal from 'decimal.js';
import { SysAdminInvoiceEmail } from '@/emails/sysadmin-invoice';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export async function sendSysAdminInvoice(invoiceId: string): Promise<{ sent: boolean; warning?: string }> {
  const invoice = await prisma.sysAdminInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, tenant: { select: { name: true } } },
  });
  if (!invoice) throw new Error('Invoice not found');

  const owner = await prisma.user.findFirst({
    where: { tenantId: invoice.tenantId, role: 'OWNER', isActive: true },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!owner) {
    return { sent: false, warning: 'No active owner found for this tenant. Invoice saved as SENT but email not delivered.' };
  }

  try {
    const result = await dispatchNotification('invoice.created', {
      tenantId: invoice.tenantId,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.tenant.name,
        amount: '$' + new Decimal(invoice.total.toString()).toFixed(2),
      },
      relatedEntity: { type: 'SysAdminInvoice', id: invoice.id },
    });
    return { sent: result.sent > 0, warning: result.failed > 0 ? 'Partial send failure via dispatcher' : undefined };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendSysAdminInvoice(invoice, owner);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendSysAdminInvoice(
  invoice: Awaited<ReturnType<typeof prisma.sysAdminInvoice.findUnique>> & {
    items: Array<{ description: string; quantity: unknown; unitPrice: unknown; amount: unknown }>;
    tenant: { name: string };
  },
  owner: { email: string; firstName: string | null; lastName: string | null }
): Promise<{ sent: boolean; warning?: string }> {
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email;
  const formattedItems = invoice!.items.map((item) => ({
    description: item.description,
    quantity: new Decimal(item.quantity!.toString()).toFixed(2),
    unitPrice: '$' + new Decimal(item.unitPrice!.toString()).toFixed(2),
    amount: '$' + new Decimal(item.amount!.toString()).toFixed(2),
  }));

  await sendEmail({
    to: owner.email,
    subject: `Invoice ${invoice!.invoiceNumber} from DriveCommand - Due ${new Date(invoice!.dueDate).toLocaleDateString()}`,
    react: React.createElement(SysAdminInvoiceEmail, {
      invoiceNumber: invoice!.invoiceNumber,
      tenantName: invoice!.tenant.name,
      ownerName,
      issueDate: new Date(invoice!.issueDate).toLocaleDateString(),
      dueDate: new Date(invoice!.dueDate).toLocaleDateString(),
      items: formattedItems,
      subtotal: '$' + new Decimal(invoice!.subtotal.toString()).toFixed(2),
      total: '$' + new Decimal(invoice!.total.toString()).toFixed(2),
      notes: invoice!.notes ?? undefined,
    }),
  });

  return { sent: true };
}
