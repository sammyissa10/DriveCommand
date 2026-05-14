import { NotificationCategory } from '@prisma/client';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const customerTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'customer.tracking_link_sent',
    category: NotificationCategory.CUSTOMER,
    displayName: 'Tracking Link Sent to Customer',
    description: 'Sent to the external customer when an owner shares a shipment tracking link.',
    defaultSubject: 'Track your shipment #{{loadNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Track your shipment',
      paragraphTextWithVars:
        'Hi {{customerName}}, your shipment #{{loadNumber}} is on its way. Use the link below to track it in real time.',
      ctaLabel: 'Track Shipment',
      ctaUrl: '{{trackingUrl}}',
      footerNote: 'This link was sent from DriveCommand on behalf of your carrier.',
    }),
    availableVariables: [
      { name: 'customerEmail', description: "Customer's email address", sampleValue: 'customer@example.com' },
      { name: 'customerName', description: "Customer's name", sampleValue: 'Bob Johnson' },
      { name: 'loadNumber', description: 'Load or shipment number', sampleValue: 'LD-1042' },
      { name: 'trackingUrl', description: 'Public tracking URL', sampleValue: 'https://app.drivecommand.com/track/abc123' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: false,
  },
  {
    triggerKey: 'customer.delivered_notification',
    category: NotificationCategory.CUSTOMER,
    displayName: 'Delivery Confirmed to Customer',
    description: 'Sent to the external customer when their shipment is confirmed as delivered.',
    defaultSubject: 'Your shipment #{{loadNumber}} has been delivered',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Delivery confirmed',
      paragraphTextWithVars:
        'Hi {{customerName}}, your shipment #{{loadNumber}} was successfully delivered on {{deliveredAt}}. Thank you for your business.',
      footerNote: 'Please contact your carrier if you have any questions about your delivery.',
    }),
    availableVariables: [
      { name: 'customerEmail', description: "Customer's email address", sampleValue: 'customer@example.com' },
      { name: 'customerName', description: "Customer's name", sampleValue: 'Bob Johnson' },
      { name: 'loadNumber', description: 'Load or shipment number', sampleValue: 'LD-1042' },
      { name: 'deliveredAt', description: 'Delivery timestamp', sampleValue: '2026-05-14 03:45 PM PDT' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: false,
  },
];
