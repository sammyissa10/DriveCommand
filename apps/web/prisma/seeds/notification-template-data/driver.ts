import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const driverTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'driver.invited',
    category: NotificationCategory.DRIVER,
    displayName: 'Driver Invited',
    description: 'Sent to a newly invited driver with their invite link to create an account.',
    defaultSubject: "You've been invited to join {{tenantName}} on DriveCommand",
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Driver invitation',
      paragraphTextWithVars:
        'Hi {{driverFirstName}}, you have been invited to join {{tenantName}} as a driver on DriveCommand. Accept your invitation to access your loads, documents, and messages.',
      ctaLabel: 'Accept Invitation',
      ctaUrl: '{{inviteUrl}}',
      footerNote: 'If you did not expect this invitation, you can ignore this email.',
    }),
    availableVariables: [
      { name: 'driverEmail', description: 'Email address the invite was sent to', sampleValue: 'driver@example.com' },
      { name: 'driverFirstName', description: "Driver's first name", sampleValue: 'Maria' },
      { name: 'tenantName', description: 'Name of the trucking company', sampleValue: 'Acme Trucking' },
      { name: 'inviteUrl', description: 'URL to accept the invitation', sampleValue: 'https://app.drivecommand.com/accept-invite?token=abc123' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'driverEmail' }],
    isActive: true,
    inAppEnabled: false,
  },
  {
    triggerKey: 'driver.hos_violation',
    category: NotificationCategory.DRIVER,
    displayName: 'HOS Violation Detected',
    description: 'Sent to owners when a driver exceeds Hours of Service limits.',
    defaultSubject: 'HOS violation detected for {{driverName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Hours of Service violation',
      paragraphTextWithVars:
        '{{driverName}} has exceeded HOS limits. Violation type: {{violationType}}. Detected at {{timestamp}}. Review and take action to stay compliant.',
      ctaLabel: 'View HOS Log',
      ctaUrl: 'https://app.drivecommand.com/owner/drivers/{{driverId}}',
    }),
    availableVariables: [
      { name: 'driverId', description: 'Internal driver ID', sampleValue: 'driver_xyz' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'violationType', description: 'Type of HOS violation', sampleValue: '11-hour driving limit exceeded' },
      { name: 'timestamp', description: 'When the violation was detected', sampleValue: '2026-05-14 08:00 AM PDT' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'driver.license_expiring',
    category: NotificationCategory.DRIVER,
    displayName: 'Driver License Expiring',
    description: 'Sent to owners when a driver license or certification is expiring soon.',
    defaultSubject: "{{driverName}}'s {{licenseType}} expires in {{daysUntilExpiry}} days",
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'License expiring soon',
      paragraphTextWithVars:
        "{{driverName}}'s {{licenseType}} expires on {{expiresAt}} ({{daysUntilExpiry}} days from now). Ensure the driver renews before the expiration date to stay compliant.",
      ctaLabel: 'View Driver',
      ctaUrl: 'https://app.drivecommand.com/owner/drivers/{{driverId}}',
    }),
    availableVariables: [
      { name: 'driverId', description: 'Internal driver ID', sampleValue: 'driver_xyz' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'licenseType', description: 'Type of license or certification', sampleValue: 'CDL Class A' },
      { name: 'expiresAt', description: 'Expiration date', sampleValue: '2026-06-15' },
      { name: 'daysUntilExpiry', description: 'Days until expiration', sampleValue: '30' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'driver.incident_reported',
    category: NotificationCategory.DRIVER,
    displayName: 'Driver Incident Reported',
    description: 'Sent to owners when a driver submits an incident report.',
    defaultSubject: '{{driverName}} reported an incident — {{severity}} severity',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Incident reported',
      paragraphTextWithVars:
        '{{driverName}} submitted an incident report. Type: {{incidentType}}. Severity: {{severity}}. Review the report and take appropriate action.',
      ctaLabel: 'View Incident Report',
      ctaUrl: '{{reportUrl}}',
    }),
    availableVariables: [
      { name: 'driverId', description: 'Internal driver ID', sampleValue: 'driver_xyz' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'incidentType', description: 'Type of incident', sampleValue: 'Vehicle Damage' },
      { name: 'severity', description: 'Incident severity level', sampleValue: 'MEDIUM' },
      { name: 'reportUrl', description: 'URL to the incident report', sampleValue: 'https://app.drivecommand.com/owner/incidents/inc_123' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
