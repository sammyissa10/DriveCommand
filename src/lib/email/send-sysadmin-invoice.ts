import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/gmail-client';
import React from 'react';
import Decimal from 'decimal.js';
import { SysAdminInvoiceEmail } from '@/emails/sysadmin-invoice';

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

  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email;
  const formattedItems = invoice.items.map((item) => ({
    description: item.description,
    quantity: new Decimal(item.quantity.toString()).toFixed(2),
    unitPrice: '$' + new Decimal(item.unitPrice.toString()).toFixed(2),
    amount: '$' + new Decimal(item.amount.toString()).toFixed(2),
  }));

  await sendEmail({
    to: owner.email,
    subject: `Invoice ${invoice.invoiceNumber} from DriveCommand - Due ${new Date(invoice.dueDate).toLocaleDateString()}`,
    react: React.createElement(SysAdminInvoiceEmail, {
      invoiceNumber: invoice.invoiceNumber,
      tenantName: invoice.tenant.name,
      ownerName,
      issueDate: new Date(invoice.issueDate).toLocaleDateString(),
      dueDate: new Date(invoice.dueDate).toLocaleDateString(),
      items: formattedItems,
      subtotal: '$' + new Decimal(invoice.subtotal.toString()).toFixed(2),
      total: '$' + new Decimal(invoice.total.toString()).toFixed(2),
      notes: invoice.notes ?? undefined,
    }),
  });

  return { sent: true };
}
