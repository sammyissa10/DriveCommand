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
  | 'digest.compliance_30day';

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
};
