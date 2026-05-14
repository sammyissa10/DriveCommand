import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const digestTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'digest.daily_driver',
    category: NotificationCategory.DIGEST,
    displayName: 'Daily Driver Summary',
    description: 'A daily digest sent to each driver summarizing their activity for the day.',
    defaultSubject: 'Your DriveCommand summary for {{date}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Your daily summary',
      paragraphTextWithVars:
        'Hi {{driverName}}, here is your activity summary for {{date}}. Loads completed: {{loadCount}}.',
      ctaLabel: 'View Dashboard',
      ctaUrl: 'https://app.drivecommand.com/driver',
      footerNote: 'This is an automated daily summary from DriveCommand.',
    }),
    availableVariables: [
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'date', description: 'Summary date', sampleValue: 'May 14, 2026' },
      { name: 'loadCount', description: 'Number of loads completed today', sampleValue: '2' },
      { name: 'summaryHtml', description: 'Full HTML summary block (injected at render time)', sampleValue: '<ul><li>Load LD-1042 delivered</li></ul>' },
    ],
    defaultRecipients: [{ type: 'role', role: 'DRIVER' }],
    isActive: true,
    inAppEnabled: false,
  },
  {
    triggerKey: 'digest.weekly_owner',
    category: NotificationCategory.DIGEST,
    displayName: 'Weekly Owner Summary',
    description: 'A weekly digest sent to owners with fleet performance metrics for the week.',
    defaultSubject: 'Weekly fleet summary — {{weekRange}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Weekly fleet summary',
      paragraphTextWithVars:
        'Hi {{ownerName}}, here is your fleet performance for {{weekRange}}. Loads completed: {{loadCount}}. Revenue: {{revenue}}.',
      ctaLabel: 'View Dashboard',
      ctaUrl: 'https://app.drivecommand.com/owner',
      footerNote: 'This is an automated weekly summary from DriveCommand.',
    }),
    availableVariables: [
      { name: 'ownerName', description: "Owner's first name", sampleValue: 'John' },
      { name: 'weekRange', description: 'Date range for the week', sampleValue: 'May 8–14, 2026' },
      { name: 'loadCount', description: 'Loads completed this week', sampleValue: '18' },
      { name: 'revenue', description: 'Total revenue for the week', sampleValue: '$24,500.00' },
      { name: 'summaryHtml', description: 'Full HTML summary block (injected at render time)', sampleValue: '<ul><li>18 loads delivered</li></ul>' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: false,
  },
  {
    triggerKey: 'digest.compliance_30day',
    category: NotificationCategory.DIGEST,
    displayName: '30-Day Compliance Summary',
    description: 'Monthly compliance digest alerting owners to documents expiring within 30 days.',
    defaultSubject: 'Compliance alert — {{expiringDocCount}} documents expiring within 30 days',
    defaultBlockJson: buildDefaultTemplate({
      headerText: '30-day compliance alert',
      paragraphTextWithVars:
        'Hi {{ownerName}}, you have {{expiringDocCount}} compliance document(s) expiring within the next 30 days. Review and renew them to keep your fleet operational.',
      ctaLabel: 'View Compliance',
      ctaUrl: 'https://app.drivecommand.com/owner/compliance',
      footerNote: 'This is an automated compliance digest from DriveCommand.',
    }),
    availableVariables: [
      { name: 'ownerName', description: "Owner's first name", sampleValue: 'John' },
      { name: 'expiringDocCount', description: 'Number of documents expiring within 30 days', sampleValue: '3' },
      { name: 'summaryHtml', description: 'Full HTML list of expiring documents (injected at render time)', sampleValue: '<ul><li>Unit 42 — Insurance expires Jun 1</li></ul>' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
