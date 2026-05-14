import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const financeTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'invoice.created',
    category: NotificationCategory.FINANCE,
    displayName: 'Invoice Created',
    description: 'Sent to owners when a new invoice is created.',
    defaultSubject: 'Invoice {{invoiceNumber}} created for {{customerName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Invoice created',
      paragraphTextWithVars:
        'Invoice {{invoiceNumber}} for {{amount}} has been created for {{customerName}}. Review and send it to your customer.',
      ctaLabel: 'View Invoice',
      ctaUrl: 'https://app.drivecommand.com/owner/invoices/{{invoiceId}}',
    }),
    availableVariables: [
      { name: 'invoiceId', description: 'Internal invoice ID', sampleValue: 'inv_abc' },
      { name: 'invoiceNumber', description: 'Invoice number', sampleValue: 'INV-2048' },
      { name: 'customerName', description: 'Customer or broker name', sampleValue: 'Acme Freight Co.' },
      { name: 'amount', description: 'Invoice total amount', sampleValue: '$3,250.00' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'invoice.paid',
    category: NotificationCategory.FINANCE,
    displayName: 'Invoice Paid',
    description: 'Sent to owners when an invoice is marked as paid.',
    defaultSubject: 'Invoice {{invoiceNumber}} paid — {{amount}} received',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Invoice paid',
      paragraphTextWithVars:
        'Invoice {{invoiceNumber}} for {{amount}} from {{customerName}} has been marked as paid on {{paidAt}}.',
      ctaLabel: 'View Invoice',
      ctaUrl: 'https://app.drivecommand.com/owner/invoices/{{invoiceId}}',
    }),
    availableVariables: [
      { name: 'invoiceId', description: 'Internal invoice ID', sampleValue: 'inv_abc' },
      { name: 'invoiceNumber', description: 'Invoice number', sampleValue: 'INV-2048' },
      { name: 'customerName', description: 'Customer or broker name', sampleValue: 'Acme Freight Co.' },
      { name: 'amount', description: 'Invoice total amount', sampleValue: '$3,250.00' },
      { name: 'paidAt', description: 'Date payment was received', sampleValue: '2026-05-14' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'invoice.overdue',
    category: NotificationCategory.FINANCE,
    displayName: 'Invoice Overdue',
    description: 'Sent to owners when an invoice is past due.',
    defaultSubject: 'Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Invoice overdue',
      paragraphTextWithVars:
        'Invoice {{invoiceNumber}} for {{amount}} from {{customerName}} is {{daysOverdue}} days past due. Follow up with the customer to collect payment.',
      ctaLabel: 'View Invoice',
      ctaUrl: 'https://app.drivecommand.com/owner/invoices/{{invoiceId}}',
    }),
    availableVariables: [
      { name: 'invoiceId', description: 'Internal invoice ID', sampleValue: 'inv_abc' },
      { name: 'invoiceNumber', description: 'Invoice number', sampleValue: 'INV-2048' },
      { name: 'customerName', description: 'Customer or broker name', sampleValue: 'Acme Freight Co.' },
      { name: 'amount', description: 'Invoice total amount', sampleValue: '$3,250.00' },
      { name: 'daysOverdue', description: 'Number of days the invoice is past due', sampleValue: '15' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'payroll.processed',
    category: NotificationCategory.FINANCE,
    displayName: 'Payroll Processed',
    description: 'Sent to a driver when a payroll record is processed for them.',
    defaultSubject: 'Payroll for {{payPeriod}} processed — {{amount}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Payroll processed',
      paragraphTextWithVars:
        'Hi {{driverName}}, your payroll for the period {{payPeriod}} has been processed. Amount: {{amount}}.',
      ctaLabel: 'View Pay Record',
      ctaUrl: 'https://app.drivecommand.com/driver/payroll/{{payrollId}}',
      footerNote: 'Contact your dispatcher if you have questions about your pay.',
    }),
    availableVariables: [
      { name: 'payrollId', description: 'Internal payroll record ID', sampleValue: 'payroll_abc' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'payPeriod', description: 'Pay period description', sampleValue: 'May 1–15, 2026' },
      { name: 'amount', description: 'Net pay amount', sampleValue: '$2,800.00' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'payrollId' }],
    isActive: true,
    inAppEnabled: true,
  },
];
