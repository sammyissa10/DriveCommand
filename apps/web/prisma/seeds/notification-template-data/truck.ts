import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const truckTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'truck.maintenance_due',
    category: NotificationCategory.TRUCK,
    displayName: 'Truck Maintenance Due',
    description: 'Sent when a truck is due for scheduled maintenance.',
    defaultSubject: 'Maintenance due for {{unitNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Maintenance due',
      paragraphTextWithVars:
        'Truck {{unitNumber}} is due for {{maintenanceType}} on {{dueAt}}. Schedule the service to avoid compliance issues.',
      ctaLabel: 'View Truck',
      ctaUrl: 'https://app.drivecommand.com/owner/trucks/{{truckId}}',
    }),
    availableVariables: [
      { name: 'truckId', description: 'Internal truck ID', sampleValue: 'truck_abc' },
      { name: 'unitNumber', description: 'Truck unit number or identifier', sampleValue: 'Unit 42' },
      { name: 'maintenanceType', description: 'Type of maintenance required', sampleValue: 'Oil Change' },
      { name: 'dueAt', description: 'Maintenance due date', sampleValue: '2026-05-20' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'truck.document_expiring',
    category: NotificationCategory.TRUCK,
    displayName: 'Truck Document Expiring',
    description: 'Sent when a truck compliance document (registration, insurance, etc.) is about to expire.',
    defaultSubject: '{{documentType}} expiring soon for {{unitNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Truck document expiring',
      paragraphTextWithVars:
        'The {{documentType}} for truck {{unitNumber}} expires on {{expiresAt}}. Renew the document before the expiration date to keep the truck in service.',
      ctaLabel: 'View Truck Documents',
      ctaUrl: 'https://app.drivecommand.com/owner/trucks/{{truckId}}',
    }),
    availableVariables: [
      { name: 'truckId', description: 'Internal truck ID', sampleValue: 'truck_abc' },
      { name: 'unitNumber', description: 'Truck unit number or identifier', sampleValue: 'Unit 42' },
      { name: 'documentType', description: 'Type of expiring document', sampleValue: 'Commercial Auto Insurance' },
      { name: 'expiresAt', description: 'Document expiration date', sampleValue: '2026-06-01' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'truck.inspection_due',
    category: NotificationCategory.TRUCK,
    displayName: 'Truck Inspection Due',
    description: 'Sent when a truck is due for a periodic safety or DOT inspection.',
    defaultSubject: 'Inspection due for {{unitNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Inspection due',
      paragraphTextWithVars:
        'Truck {{unitNumber}} is due for a {{inspectionType}} on {{dueAt}}. Schedule the inspection to maintain compliance.',
      ctaLabel: 'View Truck',
      ctaUrl: 'https://app.drivecommand.com/owner/trucks/{{truckId}}',
    }),
    availableVariables: [
      { name: 'truckId', description: 'Internal truck ID', sampleValue: 'truck_abc' },
      { name: 'unitNumber', description: 'Truck unit number or identifier', sampleValue: 'Unit 42' },
      { name: 'inspectionType', description: 'Type of inspection required', sampleValue: 'Annual DOT Inspection' },
      { name: 'dueAt', description: 'Inspection due date', sampleValue: '2026-05-25' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
