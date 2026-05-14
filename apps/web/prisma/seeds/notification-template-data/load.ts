import { NotificationCategory } from '@prisma/client';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const loadTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'load.created',
    category: NotificationCategory.LOAD,
    displayName: 'Load Created',
    description: 'Sent to owners when a new load is created in the system.',
    defaultSubject: 'New load #{{loadNumber}} created',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'New load created',
      paragraphTextWithVars:
        'Load #{{loadNumber}} has been created for the lane {{originCity}} → {{destCity}}. Assign a driver to dispatch it.',
      ctaLabel: 'View Load',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
      footerNote: 'This is an automated notification from DriveCommand.',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'originCity', description: 'Pickup city', sampleValue: 'Los Angeles, CA' },
      { name: 'destCity', description: 'Delivery city', sampleValue: 'Phoenix, AZ' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.assigned',
    category: NotificationCategory.LOAD,
    displayName: 'Load Assigned to Driver',
    description: 'Sent to the assigned driver and owner when a load is assigned.',
    defaultSubject: 'Load #{{loadNumber}} assigned to you',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Load #{{loadNumber}} assigned to you',
      paragraphTextWithVars:
        'You have been assigned load #{{loadNumber}} for the lane {{originCity}} → {{destCity}}. Review the load details and prepare for dispatch.',
      ctaLabel: 'View Load',
      ctaUrl: 'https://app.drivecommand.com/driver/loads/{{loadId}}',
      footerNote: 'Contact dispatch if you have questions.',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'driverId', description: 'Assigned driver ID', sampleValue: 'driver_xyz' },
      { name: 'driverName', description: 'Assigned driver full name', sampleValue: 'Maria Garcia' },
      { name: 'originCity', description: 'Pickup city', sampleValue: 'Los Angeles, CA' },
      { name: 'destCity', description: 'Delivery city', sampleValue: 'Phoenix, AZ' },
    ],
    defaultRecipients: [
      { type: 'related', payloadKey: 'driverId' },
      { type: 'role', role: 'OWNER' },
    ],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.dispatched',
    category: NotificationCategory.LOAD,
    displayName: 'Load Dispatched',
    description: 'Sent when a load status is changed to Dispatched.',
    defaultSubject: 'Load #{{loadNumber}} dispatched — {{driverName}} is on the way',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Load dispatched',
      paragraphTextWithVars:
        'Load #{{loadNumber}} has been dispatched. {{driverName}} is en route to the pickup location.',
      ctaLabel: 'Track Load',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.picked_up',
    category: NotificationCategory.LOAD,
    displayName: 'Load Picked Up',
    description: 'Sent when a driver marks a load as picked up.',
    defaultSubject: 'Load #{{loadNumber}} picked up',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Pickup confirmed',
      paragraphTextWithVars:
        '{{driverName}} confirmed pickup of load #{{loadNumber}} at {{pickupTime}}. The load is now in transit.',
      ctaLabel: 'View Load',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'pickupTime', description: 'Pickup timestamp', sampleValue: '2026-05-14 09:30 AM PDT' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.in_transit',
    category: NotificationCategory.LOAD,
    displayName: 'Load In Transit',
    description: 'Sent when a load status changes to In Transit.',
    defaultSubject: 'Load #{{loadNumber}} is in transit',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Load in transit',
      paragraphTextWithVars:
        'Load #{{loadNumber}} is now in transit with {{driverName}}. You will be notified when delivery is confirmed.',
      ctaLabel: 'Track Load',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.delivered',
    category: NotificationCategory.LOAD,
    displayName: 'Load Delivered',
    description: 'Sent when a driver confirms delivery of a load.',
    defaultSubject: 'Load #{{loadNumber}} delivered',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Delivery confirmed',
      paragraphTextWithVars:
        '{{driverName}} confirmed delivery of load #{{loadNumber}} at {{deliveryTime}}. You can now create an invoice.',
      ctaLabel: 'View Load',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'deliveryTime', description: 'Delivery timestamp', sampleValue: '2026-05-14 03:45 PM PDT' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.invoiced',
    category: NotificationCategory.LOAD,
    displayName: 'Load Invoiced',
    description: 'Sent when an invoice is created for a delivered load.',
    defaultSubject: 'Invoice {{invoiceNumber}} created for load #{{loadNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Invoice created',
      paragraphTextWithVars:
        'Invoice {{invoiceNumber}} for {{amount}} has been created for load #{{loadNumber}}. Review and send to your customer.',
      ctaLabel: 'View Invoice',
      ctaUrl: 'https://app.drivecommand.com/owner/invoices/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'invoiceNumber', description: 'Invoice number', sampleValue: 'INV-2048' },
      { name: 'amount', description: 'Invoice total amount', sampleValue: '$3,250.00' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.cancelled',
    category: NotificationCategory.LOAD,
    displayName: 'Load Cancelled',
    description: 'Sent when a load is cancelled.',
    defaultSubject: 'Load #{{loadNumber}} has been cancelled',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Load cancelled',
      paragraphTextWithVars:
        'Load #{{loadNumber}} has been cancelled. Reason: {{reason}}. Review your schedule and update assignments as needed.',
      ctaLabel: 'View Loads',
      ctaUrl: 'https://app.drivecommand.com/owner/loads',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'reason', description: 'Cancellation reason', sampleValue: 'Customer request' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.bol_uploaded',
    category: NotificationCategory.LOAD,
    displayName: 'BOL Uploaded',
    description: 'Sent when a Bill of Lading document is uploaded for a load.',
    defaultSubject: 'BOL uploaded for load #{{loadNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Bill of Lading uploaded',
      paragraphTextWithVars:
        '{{uploadedBy}} uploaded a Bill of Lading for load #{{loadNumber}}. Review the document to confirm it is correct.',
      ctaLabel: 'View Document',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'uploadedBy', description: 'Name of the person who uploaded the BOL', sampleValue: 'Maria Garcia' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'load.pod_uploaded',
    category: NotificationCategory.LOAD,
    displayName: 'POD Uploaded',
    description: 'Sent when a Proof of Delivery document is uploaded for a load.',
    defaultSubject: 'POD uploaded for load #{{loadNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Proof of Delivery uploaded',
      paragraphTextWithVars:
        '{{uploadedBy}} uploaded a Proof of Delivery for load #{{loadNumber}}. The load is ready for invoicing.',
      ctaLabel: 'View Document',
      ctaUrl: 'https://app.drivecommand.com/owner/loads/{{loadId}}',
    }),
    availableVariables: [
      { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc' },
      { name: 'loadNumber', description: 'Human-readable load number', sampleValue: 'LD-1042' },
      { name: 'uploadedBy', description: 'Name of the person who uploaded the POD', sampleValue: 'Maria Garcia' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
