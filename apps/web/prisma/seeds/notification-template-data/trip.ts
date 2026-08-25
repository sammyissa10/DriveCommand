/**
 * Document Import Phase 10 — the eight Trip and Inspection triggers of Section 13.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING TO READ BEFORE EDITING THIS FILE
 * ---------------------------------------------------------------------------
 *
 * `defaultRecipients: []` on the six SUBSCRIBERS triggers is not an oversight
 * and is not a placeholder. It is the mechanism.
 *
 * `resolveRecipients` UNIONS two independent sources: the rules in this field,
 * and rows in `NotificationSubscription`. A rule of `{ type: 'tenant_owners' }`
 * or `{ type: 'role', role: 'OWNER' }` addresses every matching active user
 * WITHOUT consulting subscription at all, and `UserNotificationPreference` is a
 * channel preference applied afterwards that DEFAULTS TO TRUE. Put either rule
 * on a subscriber trigger and every owner in the tenant receives it whether or
 * not they ever asked to — which is the drift Section 13 and the phase brief
 * both name as the thing most likely to go wrong here.
 *
 * With an empty array there is nothing to expand, so `NotificationSubscription`
 * is the ONLY source of recipients and an unsubscribed owner receives nothing
 * BY CONSTRUCTION. The acceptance test ("subscribe A only, fail an inspection,
 * only A is notified") passes because of the shape of this data, not because of
 * a check somewhere that a later edit could remove.
 *
 * The two DRIVER-audience triggers use `{ type: 'related' }` instead, because
 * Section 13 names their audience as Driver, not Subscribers. A consequence
 * worth stating rather than burying: a driver cannot fully unsubscribe from
 * "you have been assigned a trip" — they can only turn off channels via
 * `UserNotificationPreference`. That is deliberate. It is the subject's own
 * trip, and it is the same shape `load.assigned` has always had.
 *
 * ---------------------------------------------------------------------------
 * CHANNELS
 * ---------------------------------------------------------------------------
 * `pushEnabled` is set true on exactly the three triggers whose Section 13 row
 * names Push: trip.assigned, trip.reminder, inspection.failed. Every other seed
 * in this repo omits the field and takes the column's `false` default, which is
 * what keeps the dispatcher's new PUSH branch from changing any existing
 * trigger's behaviour.
 *
 * `inAppEnabled: true` everywhere here — all eight name In-app.
 * Email is not a per-template flag; it is driven by the recipient's preference,
 * so the Section 13 rows that omit Email are recorded in each `description`
 * rather than being enforceable at this layer. Called out honestly rather than
 * implied: a subscriber to `inspection.passed` who leaves `emailEnabled` on WILL
 * receive an email for it, because the schema has no per-template email switch.
 */

import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

const APP = 'https://app.drivecommand.com';

export const tripTemplates: NotificationTemplateSeed[] = [
  // -------------------------------------------------------------------------
  // Trip assigned — Section 13 row 1a. Audience: Driver. Channels: Push, in-app.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'trip.assigned',
    category: NotificationCategory.TRIP,
    displayName: 'Trip Assigned',
    description:
      'Sent to the assigned driver when a trip is committed from a document import. Channels: push and in-app.',
    defaultSubject: 'New trip {{tripNumber}} — {{firstStop}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'You have a new trip',
      paragraphTextWithVars:
        '{{driverName}}, trip {{tripNumber}} is yours. Truck {{truckUnit}}, {{stopCount}} stops, first stop {{firstStop}}, leaving {{scheduledDeparture}}.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'driverUserId', description: 'User id of the assigned driver', sampleValue: '8f2c…' },
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'firstStop', description: 'Name and city of the first stop', sampleValue: 'Hall Ford, West Bend' },
      { name: 'scheduledDeparture', description: 'Planned departure', sampleValue: 'Tue 26 Aug, 06:30' },
      { name: 'stopCount', description: 'Total stops on the trip', sampleValue: '12' },
    ],
    // Driver audience — the subject of the trip, not a subscriber.
    defaultRecipients: [{ type: 'related', payloadKey: 'driverUserId' }],
    isActive: true,
    inAppEnabled: true,
    pushEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Trip reminder — Section 13 row 1b. Audience: Driver. Channels: Push, in-app.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'trip.reminder',
    category: NotificationCategory.TRIP,
    displayName: 'Trip Reminder',
    description:
      'Reminder to the driver about a trip that has not started yet. Fired by the daily cron. Channels: push and in-app.',
    defaultSubject: 'Reminder: trip {{tripNumber}} departs {{scheduledDeparture}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Trip coming up',
      paragraphTextWithVars:
        '{{driverName}}, trip {{tripNumber}} has not been started. Truck {{truckUnit}}, first stop {{firstStop}}, departure {{scheduledDeparture}}.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'driverUserId', description: 'User id of the assigned driver', sampleValue: '8f2c…' },
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'firstStop', description: 'Name and city of the first stop', sampleValue: 'Hall Ford, West Bend' },
      { name: 'scheduledDeparture', description: 'Planned departure', sampleValue: 'Tue 26 Aug, 06:30' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'driverUserId' }],
    isActive: true,
    inAppEnabled: true,
    pushEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Trip started — Section 13 row 6a. Audience: Subscribers. Channels: In-app.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'trip.started',
    category: NotificationCategory.TRIP,
    displayName: 'Trip Started',
    description:
      'Sent to subscribers when a driver starts a trip. In-app. Subscribe in My Notification Preferences.',
    defaultSubject: 'Trip {{tripNumber}} started — {{driverName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Trip started',
      paragraphTextWithVars:
        '{{driverName}} started trip {{tripNumber}} on truck {{truckUnit}} at {{startedAt}}.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'startedAt', description: 'When the trip was started', sampleValue: 'Tue 26 Aug, 06:34' },
    ],
    defaultRecipients: [], // Subscribers only — see the header.
    isActive: true,
    inAppEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Trip completed — Section 13 row 6b. Audience: Subscribers. Channels: In-app.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'trip.completed',
    category: NotificationCategory.TRIP,
    displayName: 'Trip Completed',
    description:
      'Sent to subscribers when a trip is completed. In-app. Subscribe in My Notification Preferences.',
    defaultSubject: 'Trip {{tripNumber}} completed — {{driverName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Trip completed',
      paragraphTextWithVars:
        '{{driverName}} completed trip {{tripNumber}} on truck {{truckUnit}} at {{completedAt}}. {{stopCount}} stops.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'completedAt', description: 'When the trip was completed', sampleValue: 'Tue 26 Aug, 18:05' },
      { name: 'stopCount', description: 'Total stops on the trip', sampleValue: '12' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Inspection passed — Section 13 row 2. Audience: Subscribers. Channels: In-app.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'inspection.passed',
    category: NotificationCategory.TRIP,
    displayName: 'Inspection Passed',
    description:
      'Sent to subscribers when a pre-trip inspection passes with no defects. In-app. Subscribe in My Notification Preferences.',
    defaultSubject: 'Inspection passed — {{truckUnit}}, trip {{tripNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Inspection passed',
      paragraphTextWithVars:
        '{{driverName}} passed the pre-trip inspection on truck {{truckUnit}} for trip {{tripNumber}}. {{itemCount}} items checked, no defects.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'itemCount', description: 'Number of inspection items answered', sampleValue: '11' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Passed with defects — Section 13 row 3. Subscribers. In-app, email.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'inspection.passed_with_defects',
    category: NotificationCategory.TRIP,
    displayName: 'Inspection Passed With Defects',
    description:
      'Sent to subscribers when an inspection has failures but none critical, so the trip still starts. In-app and email. Subscribe in My Notification Preferences.',
    defaultSubject: 'Defects logged — {{truckUnit}}, trip {{tripNumber}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Inspection passed with defects',
      paragraphTextWithVars:
        '{{driverName}} started trip {{tripNumber}} on truck {{truckUnit}}. {{defectCount}} non-critical defects were logged against the truck: {{defectItems}}.',
      ctaLabel: 'Open truck',
      ctaUrl: `${APP}/carrier/trucks/{{truckUnit}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Mike Rodriguez' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-104' },
      { name: 'defectCount', description: 'Number of defects logged', sampleValue: '2' },
      { name: 'defectItems', description: 'The defective items, comma separated', sampleValue: 'Mirrors, Wiper blades' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Inspection failed — Section 13 row 4. Subscribers. In-app, email, push.
  //
  // Section 13 item 4 names the required content for this one specifically:
  // the driver, the truck, the trip, and the failed items. All four are in the
  // subject or the first sentence, so it is readable on a lock screen without
  // opening anything.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'inspection.failed',
    category: NotificationCategory.TRIP,
    displayName: 'Inspection Failed',
    description:
      'Sent to subscribers when a critical pre-trip item fails and the trip is blocked. In-app, email and push. Subscribe in My Notification Preferences.',
    defaultSubject: 'Trip blocked — {{truckUnit}} failed {{failedItems}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Inspection failed — trip blocked',
      paragraphTextWithVars:
        '{{driverName}} failed the pre-trip inspection on truck {{truckUnit}} for trip {{tripNumber}}. {{failedCount}} critical items failed: {{failedItems}}. The driver cannot start until this is resolved or overridden.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Sam Okonkwo' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-112' },
      { name: 'failedCount', description: 'Number of critical items failed', sampleValue: '1' },
      { name: 'failedItems', description: 'The failed items, comma separated', sampleValue: 'Service brakes' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: true,
    pushEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Inspection overridden — Section 13 row 5. Subscribers. In-app, email.
  //
  // Section 13 item 4: "names the overriding user and the reason". Both are in
  // the first sentence. This is the record of a truck with a failed brake check
  // leaving the yard, so the reason is quoted verbatim, never summarised.
  // -------------------------------------------------------------------------
  {
    triggerKey: 'inspection.overridden',
    category: NotificationCategory.TRIP,
    displayName: 'Inspection Overridden',
    description:
      'Sent to subscribers when an owner or manager overrides a blocked inspection. In-app and email. Subscribe in My Notification Preferences.',
    defaultSubject: 'Inspection overridden by {{overriddenBy}} — {{truckUnit}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Inspection overridden',
      paragraphTextWithVars:
        '{{overriddenBy}} overrode the blocked inspection on truck {{truckUnit}} for trip {{tripNumber}}, driven by {{driverName}}. Reason given: "{{reason}}". Failed items: {{failedItems}}.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [
      { name: 'tripId', description: 'Internal trip id', sampleValue: 'trip_abc' },
      { name: 'tripNumber', description: 'Dispatch number', sampleValue: 'DC-2026-00412' },
      { name: 'driverName', description: 'Driver full name', sampleValue: 'Sam Okonkwo' },
      { name: 'truckUnit', description: 'Truck unit number', sampleValue: 'T-112' },
      { name: 'overriddenBy', description: 'Name of the user who overrode the block', sampleValue: 'Dana Price' },
      { name: 'reason', description: 'The written reason, verbatim', sampleValue: 'Mechanic confirmed adjustment on site' },
      { name: 'failedItems', description: 'The failed items, comma separated', sampleValue: 'Service brakes' },
    ],
    defaultRecipients: [],
    isActive: true,
    inAppEnabled: true,
  },
];
