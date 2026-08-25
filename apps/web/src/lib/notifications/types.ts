import type { NotificationCategory } from '@/generated/prisma';

// Union of all 37 trigger keys (must match exactly the seed data)
export type TriggerKey =
  // User (4)
  | 'user.welcome'
  | 'user.invited'
  | 'user.password_reset'
  | 'user.role_changed'
  // Load (10)
  | 'load.created'
  | 'load.assigned'
  | 'load.dispatched'
  | 'load.picked_up'
  | 'load.in_transit'
  | 'load.delivered'
  | 'load.invoiced'
  | 'load.cancelled'
  | 'load.bol_uploaded'
  | 'load.pod_uploaded'
  // Driver (4)
  | 'driver.invited'
  | 'driver.hos_violation'
  | 'driver.license_expiring'
  | 'driver.incident_reported'
  // Manager (1)
  | 'manager.invited'
  // Truck (3)
  | 'truck.maintenance_due'
  | 'truck.document_expiring'
  | 'truck.inspection_due'
  // Message (2)
  | 'message.received'
  | 'message.broadcast'
  // Finance (4)
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.overdue'
  | 'payroll.processed'
  // Route (4)
  | 'route.assigned'
  | 'route.completed'
  | 'route.delayed'
  | 'geofence.alert'
  // Customer (2)
  | 'customer.tracking_link_sent'
  | 'customer.delivered_notification'
  // Digest (3)
  | 'digest.daily_driver'
  | 'digest.weekly_owner'
  | 'digest.compliance_30day'
  // ---------------------------------------------------------------------------
  // Document Import Phase 10 — spec Section 13 (10)
  //
  // Section 13's table has SEVEN rows; three are compound (the `·`), which is
  // where ten comes from: assigned/reminder, started/completed, and
  // needs-review/failed are each two triggers sharing a row.
  //
  // AUDIENCES, and the one distinction that matters. Six of these are
  // "Subscribers" and ship with `defaultRecipients: []` — with no rules to
  // expand, `resolveRecipients` has NOTHING but `NotificationSubscription` left
  // to draw from, so an unsubscribed owner receives nothing BY CONSTRUCTION
  // rather than by a check an edit could drop. The other four are addressed at
  // one named person (`related`), because Section 13 names their audience as
  // Driver or Uploader, not Subscribers.
  // ---------------------------------------------------------------------------
  // Trip (4)
  | 'trip.assigned'
  | 'trip.reminder'
  | 'trip.started'
  | 'trip.completed'
  // Inspection (4)
  | 'inspection.passed'
  | 'inspection.passed_with_defects'
  | 'inspection.failed'
  | 'inspection.overridden'
  // Import (2)
  | 'import.needs_review'
  | 'import.failed';

// Mapped type — typed payload shape per trigger.
// Define just enough fields to make payloads useful; expand in Plan 02.
export type NotificationPayload = {
  'user.welcome': { userId: string; firstName: string; email: string };
  'user.invited': { invitedEmail: string; inviterName: string; tenantName: string; inviteUrl: string };
  'user.password_reset': { userId: string; firstName: string; resetUrl: string };
  'user.role_changed': { userId: string; firstName: string; oldRole: string; newRole: string };

  'load.created': { loadId: string; loadNumber: string; originCity: string; destCity: string };
  'load.assigned': { loadId: string; loadNumber: string; driverId: string; driverEmail: string; driverName: string; originCity: string; destCity: string };
  'load.dispatched': { loadId: string; loadNumber: string; driverName: string };
  'load.picked_up': { loadId: string; loadNumber: string; driverName: string; pickupTime: string };
  'load.in_transit': { loadId: string; loadNumber: string; driverName: string };
  'load.delivered': { loadId: string; loadNumber: string; driverName: string; deliveryTime: string };
  'load.invoiced': { loadId: string; loadNumber: string; invoiceNumber: string; amount: string };
  'load.cancelled': { loadId: string; loadNumber: string; reason: string };
  'load.bol_uploaded': { loadId: string; loadNumber: string; uploadedBy: string };
  'load.pod_uploaded': { loadId: string; loadNumber: string; uploadedBy: string };

  'driver.invited': { driverEmail: string; driverFirstName: string; tenantName: string; inviteUrl: string };
  'driver.hos_violation': { driverId: string; driverName: string; violationType: string; timestamp: string };
  'driver.license_expiring': { driverId: string; driverName: string; licenseType: string; expiresAt: string; daysUntilExpiry: string };
  'driver.incident_reported': { driverId: string; driverName: string; incidentType: string; severity: string; reportUrl: string };

  'manager.invited': { managerEmail: string; firstName: string; tenantName: string; inviteUrl: string };

  'truck.maintenance_due': { truckId: string; unitNumber: string; maintenanceType: string; dueAt: string };
  'truck.document_expiring': { truckId: string; unitNumber: string; documentType: string; expiresAt: string };
  'truck.inspection_due': { truckId: string; unitNumber: string; inspectionType: string; dueAt: string };

  'message.received': { senderId: string; senderName: string; preview: string; threadUrl: string };
  'message.broadcast': { senderName: string; preview: string; recipientCount: string };

  'invoice.created': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string };
  'invoice.paid': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string; paidAt: string };
  'invoice.overdue': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string; daysOverdue: string };
  'payroll.processed': { payrollId: string; driverName: string; payPeriod: string; amount: string };

  'route.assigned': { routeId: string; routeName: string; driverName: string; stopCount: string };
  'route.completed': { routeId: string; routeName: string; driverName: string; completedAt: string };
  'route.delayed': { routeId: string; routeName: string; driverName: string; reason: string };
  'geofence.alert': {
    loadId: string;
    loadNumber: string;
    stopType: string;
    stopAddress: string;
    driverName: string;
    licensePlate: string;
  };

  'customer.tracking_link_sent': { customerEmail: string; customerName: string; loadNumber: string; trackingUrl: string };
  'customer.delivered_notification': { customerEmail: string; customerName: string; loadNumber: string; deliveredAt: string };

  'digest.daily_driver': { driverName: string; date: string; loadCount: string; summaryHtml: string };
  'digest.weekly_owner': { ownerName: string; weekRange: string; loadCount: string; revenue: string; summaryHtml: string };
  'digest.compliance_30day': { ownerName: string; expiringDocCount: string; summaryHtml: string };

  // ---------------------------------------------------------------------------
  // Document Import Phase 10 — Section 13.
  //
  // Every field is a STRING because `renderTemplate` substitutes `{{token}}`
  // into HTML; there is no formatter in that path. Anything derived from a
  // `@db.Date` column is therefore formatted at the EMIT SITE with the shared
  // helpers from `lib/utils/date.ts` (quick-541), never here and never inline.
  //
  // Section 13 item 4 — "actionable at a glance without opening the app" — is
  // why `inspection.failed` carries driverName, truckUnit, tripNumber AND
  // failedItems, and why `inspection.overridden` carries overriddenBy and
  // reason. Those two field sets are named in the spec, not chosen here.
  // ---------------------------------------------------------------------------
  'trip.assigned': {
    /** `related` recipient rule reads this. A User.id, not a CarrierDriver.id. */
    driverUserId: string;
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    firstStop: string;
    scheduledDeparture: string;
    stopCount: string;
  };
  'trip.reminder': {
    driverUserId: string;
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    firstStop: string;
    scheduledDeparture: string;
  };
  'trip.started': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    startedAt: string;
  };
  'trip.completed': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    completedAt: string;
    stopCount: string;
  };

  'inspection.passed': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    itemCount: string;
  };
  'inspection.passed_with_defects': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    defectCount: string;
    /** Comma-separated item names. The whole point of the email. */
    defectItems: string;
  };
  'inspection.failed': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    failedCount: string;
    /** Section 13 item 4 names this explicitly. */
    failedItems: string;
  };
  'inspection.overridden': {
    tripId: string;
    tripNumber: string;
    driverName: string;
    truckUnit: string;
    /** Section 13 item 4: "names the overriding user and the reason". */
    overriddenBy: string;
    reason: string;
    failedItems: string;
  };

  'import.needs_review': {
    /** `related` recipient rule reads this — the uploader, per Section 13. */
    uploaderUserId: string;
    importId: string;
    fileName: string;
    stopCount: string;
    clientName: string;
  };
  'import.failed': {
    uploaderUserId: string;
    importId: string;
    fileName: string;
    failureReason: string;
  };
};

/**
 * Default recipient rules — resolved at dispatch time.
 *
 * - `role`: Broadcast to all active users with the specified role in the tenant.
 * - `tenant_owners`: Broadcast to all active OWNER users in the tenant.
 * - `related`: Look up an active User by userId (UUID). The payload value at
 *   `payloadKey` must be a valid User.id UUID. Use for triggers where the
 *   recipient is already a user in the system (e.g. load.assigned, user.welcome).
 * - `external_email`: Used for triggers where the recipient is identified by a
 *   raw email in the payload and may not yet have a User row in this tenant
 *   (e.g. driver.invited, user.invited). The payload value at `payloadKey` MUST
 *   be a valid email string. If a User row with this email exists in the tenant,
 *   that user's prefs are loaded; otherwise the recipient is treated as
 *   email-only (no in-app, defaults of emailEnabled=true).
 */
export type DefaultRecipientRule =
  | { type: 'role'; role: 'OWNER' | 'MANAGER' | 'DRIVER' }
  | { type: 'tenant_owners' }
  | { type: 'related'; payloadKey: string }
  | { type: 'external_email'; payloadKey: string };

export type VariableDef = {
  name: string;         // e.g. "driverName"
  description: string;  // shown in the variable picker
  sampleValue: string;  // shown in preview
};

// Used by every seed file
export type NotificationTemplateSeed = {
  triggerKey: TriggerKey;
  category: NotificationCategory;
  displayName: string;
  description: string;
  defaultSubject: string;
  defaultBlockJson: unknown;       // valid Tiptap doc JSON; built via buildDefaultTemplate
  availableVariables: VariableDef[];
  defaultRecipients: DefaultRecipientRule[];
  isActive: boolean;               // always true for shipped defaults
  inAppEnabled: boolean;           // always true for shipped defaults
  /**
   * Phase 10. OPTIONAL, and it must stay optional: every one of the 37
   * pre-existing seeds omits it and must keep taking the column's `false`
   * default, which is the whole reason the dispatcher's new PUSH branch cannot
   * change an existing trigger's behaviour. Only the three Section 13 triggers
   * that name Push as a channel set it true.
   */
  pushEnabled?: boolean;
};
