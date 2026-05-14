import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const routeTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'route.assigned',
    category: NotificationCategory.ROUTE,
    displayName: 'Route Assigned',
    description: 'Sent to the assigned driver when a route is assigned to them.',
    defaultSubject: 'Route {{routeName}} assigned to you',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Route assigned',
      paragraphTextWithVars:
        'You have been assigned route {{routeName}} with {{stopCount}} stops. Review the route details to prepare.',
      ctaLabel: 'View Route',
      ctaUrl: 'https://app.drivecommand.com/driver/routes/{{routeId}}',
    }),
    availableVariables: [
      { name: 'routeId', description: 'Internal route ID', sampleValue: 'route_abc' },
      { name: 'routeName', description: 'Route name or identifier', sampleValue: 'LA to PHX Run' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'stopCount', description: 'Number of stops on the route', sampleValue: '4' },
    ],
    defaultRecipients: [{ type: 'role', role: 'DRIVER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'route.completed',
    category: NotificationCategory.ROUTE,
    displayName: 'Route Completed',
    description: 'Sent to owners when a driver completes all stops on a route.',
    defaultSubject: 'Route {{routeName}} completed by {{driverName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Route completed',
      paragraphTextWithVars:
        '{{driverName}} completed route {{routeName}} on {{completedAt}}. All stops have been confirmed. Review and invoice if applicable.',
      ctaLabel: 'View Route',
      ctaUrl: 'https://app.drivecommand.com/owner/routes/{{routeId}}',
    }),
    availableVariables: [
      { name: 'routeId', description: 'Internal route ID', sampleValue: 'route_abc' },
      { name: 'routeName', description: 'Route name or identifier', sampleValue: 'LA to PHX Run' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'completedAt', description: 'Route completion timestamp', sampleValue: '2026-05-14 04:00 PM PDT' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'route.delayed',
    category: NotificationCategory.ROUTE,
    displayName: 'Route Delayed',
    description: 'Sent to owners when a driver reports a delay on a route.',
    defaultSubject: 'Route {{routeName}} delayed — {{driverName}} reported an issue',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Route delay reported',
      paragraphTextWithVars:
        '{{driverName}} reported a delay on route {{routeName}}. Reason: {{reason}}. Review the situation and notify affected customers if needed.',
      ctaLabel: 'View Route',
      ctaUrl: 'https://app.drivecommand.com/owner/routes/{{routeId}}',
    }),
    availableVariables: [
      { name: 'routeId', description: 'Internal route ID', sampleValue: 'route_abc' },
      { name: 'routeName', description: 'Route name or identifier', sampleValue: 'LA to PHX Run' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
      { name: 'reason', description: 'Delay reason reported by the driver', sampleValue: 'Traffic accident on I-10' },
    ],
    defaultRecipients: [{ type: 'role', role: 'OWNER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
