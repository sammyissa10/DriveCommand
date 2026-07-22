/**
 * Carrier Ops notification helper module.
 *
 * Provides fire-and-forget email notifications for 5 carrier events:
 * 1. Dispatch assigned (to driver)
 * 2. Load delivered (to owner)
 * 3. Pay record ready (to owner)
 * 4. Invoice generated (to client AP email)
 * 5. Compliance alert batch (to owner — one per org per day)
 *
 * All functions:
 * - Are idempotent via NotificationLog
 * - Catch and log errors, NEVER throw
 * - Return void
 */

import React from 'react';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email/gmail-client';
import { getAppBaseUrl } from '@/lib/app-url';
import {
  wasNotificationAlreadySent,
  recordNotification,
  markNotificationSent,
  markNotificationFailed,
} from '@/lib/notifications/notification-deduplication';
import type { ComplianceAlert } from '@/lib/carrier/compliance';
import { createNotification } from '@/lib/carrier/in-app-notifications';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { DispatchAssignedEmail } from '@/emails/carrier/dispatch-assigned';
import { buildDispatchAssignedEmailData } from '@/lib/carrier/dispatch-assigned-email';
import { LoadDeliveredEmail } from '@/emails/carrier/load-delivered';
import { StopCompletedEmail } from '@/emails/carrier/stop-completed';
import { PayRecordReadyEmail } from '@/emails/carrier/pay-record-ready';
import { InvoiceGeneratedEmail } from '@/emails/carrier/invoice-generated';
import { ComplianceAlertEmail } from '@/emails/carrier/compliance-alert';
import { ClientShipmentUpdateEmail } from '@/emails/carrier/client-shipment-update';
import { ClientInvoiceReadyEmail } from '@/emails/carrier/client-invoice-ready';
import { getMainContact } from '@/lib/carrier/client-contacts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the owner email for an org (tenantId = orgId in Carrier Ops) */
async function getOwnerEmail(
  orgId: string
): Promise<{ email: string; firstName: string | null; lastName: string | null } | null> {
  return prisma.user.findFirst({
    where: { tenantId: orgId, role: 'OWNER', isActive: true },
    select: { email: true, firstName: true, lastName: true },
  });
}

/** Get the driver email via CarrierDriver -> User join */
async function getDriverEmail(driverId: string): Promise<string | null> {
  // TODO E-1: bare carrierDriver lookup without orgId — needs caller trace before fix
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
    select: {
      email: true,
      user: { select: { email: true } },
    },
  });

  if (!driver) return null;
  // Prefer the linked User email; fall back to the direct email field
  return driver.user?.email ?? driver.email ?? null;
}

// ---------------------------------------------------------------------------
// sendDispatchAssignedNotification
// ---------------------------------------------------------------------------

export async function sendDispatchAssignedNotification(
  orgId: string,
  dispatchId: string,
  driverId: string
): Promise<void> {
  const idempotencyKey = `carrier-dispatch-assigned-${dispatchId}-${driverId}`;

  try {
    const tenantPrisma = await getTenantPrisma();
    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    // Resolve the dispatch number from notes for use in the subject/log.
    // Stops belong to the assigned load(s) (carrier_stops.load_id), so pull them
    // through carrierLoads — NOT the trip._count.stops relation, which is 0 until
    // the load's stops are wired to the dispatch and gives the wrong count here.
    const dispatchRaw = await tenantPrisma.trip.findFirst({
      where: { id: dispatchId, orgId },
      include: {
        truck: { select: { unitNumber: true } },
        carrierLoads: {
          select: {
            stops: {
              orderBy: { sequenceOrder: 'asc' },
              select: {
                sequenceOrder: true,
                stopType: true,
                facility: { select: { name: true, city: true } },
              },
            },
          },
        },
      },
    });

    if (!dispatchRaw) {
      logger.warn('sendDispatchAssignedNotification: dispatch not found', { orgId, dispatchId });
      return;
    }

    const dispatchNumberMatch = dispatchRaw.notes?.match(
      /\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/
    );
    const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : dispatchId.slice(0, 8);
    const subject = `New Dispatch Assigned - ${dispatchNumber}`;

    // Look up driver email — may be null if driver has no portal account and no email on file
    const driverEmail = await getDriverEmail(driverId);

    // Write the NotificationLog row now (PENDING) so the attempt is always traceable,
    // even if we cannot deliver (e.g. driver has no email address yet).
    const recipientEmail = driverEmail ?? 'unknown';
    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-dispatch-assigned',
      entityType: 'dispatch',
      entityId: dispatchId,
      recipientEmail,
      emailSubject: subject,
    });

    if (!driverEmail) {
      logger.warn('sendDispatchAssignedNotification: driver has no email — notification logged as failed', {
        orgId,
        dispatchId,
        driverId,
      });
      await markNotificationFailed(prisma, logId, 'Driver has no email address on file');
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true, timezone: true },
    });

    const baseUrl = getAppBaseUrl();
    const driverPortalUrl = `${baseUrl}/driver/dispatches/${dispatchId}`;
    const companyName = tenant?.name ?? 'Your Company';

    // Build the email payload: Total Stops + itinerary come from the assigned
    // load(s); the departure instant (UTC in DB) is rendered in the tenant's
    // timezone with a zone abbreviation. Storage is unchanged.
    const emailData = buildDispatchAssignedEmailData({
      dispatchNumber,
      scheduledDeparture: dispatchRaw.scheduledDeparture,
      timezone: tenant?.timezone ?? 'UTC',
      loads: dispatchRaw.carrierLoads,
      truckUnitNumber: dispatchRaw.truck.unitNumber,
      driverPortalUrl,
      companyName,
    });

    const result = await sendEmail({
      to: driverEmail,
      subject,
      react: React.createElement(DispatchAssignedEmail, emailData),
    });

    await markNotificationSent(prisma, logId, result.id);

    // Persist in-app notification for the owner portal notification center
    const driver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: driverId },
      select: { firstName: true, lastName: true },
    });
    const driverFullName =
      [driver?.firstName, driver?.lastName].filter(Boolean).join(' ') || 'Driver';
    await createNotification({
      orgId,
      type: 'dispatch_assigned',
      title: 'Dispatch Assigned',
      message: `${driverFullName} assigned to ${dispatchNumber}`,
      entityType: 'dispatch',
      entityId: dispatchId,
    });

    // Send mobile push notification to the driver
    const driverRecord = await tenantPrisma.carrierDriver.findFirst({
      where: { id: driverId },
      select: { userId: true },
    });
    if (driverRecord?.userId) {
      await sendPushToUser(driverRecord.userId, {
        title: 'New Dispatch Assigned',
        body: `${dispatchNumber} — ${emailData.stopCount} stops — Departs ${emailData.scheduledDeparture}`,
        data: { type: 'dispatch_assigned', dispatchId },
      });
    }

    logger.info('sendDispatchAssignedNotification: sent', { orgId, dispatchId, driverId });
  } catch (err) {
    logger.error('sendDispatchAssignedNotification: failed', {
      orgId,
      dispatchId,
      driverId,
      error: err,
    });
    // Do NOT rethrow — notifications must never block the calling action
  }
}

// ---------------------------------------------------------------------------
// sendLoadDeliveredNotification
// ---------------------------------------------------------------------------

export async function sendLoadDeliveredNotification(
  orgId: string,
  loadId: string
): Promise<void> {
  try {
    const tenantPrisma = await getTenantPrisma();
    const idempotencyKey = `carrier-load-delivered-${loadId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendLoadDeliveredNotification: no owner found for org', { orgId, loadId });
      return;
    }

    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: loadId, orgId },
      include: {
        client: { select: { name: true } },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: { facility: { select: { name: true, city: true, state: true } } },
        },
      },
    });

    if (!load) {
      logger.warn('sendLoadDeliveredNotification: load not found', { orgId, loadId });
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const loadNumber = load.referenceNumber ?? loadId.slice(0, 8);
    const subject = `Load Delivered - ${loadNumber}`;
    const baseUrl = getAppBaseUrl();
    const loadDetailUrl = `${baseUrl}/carrier/loads/${loadId}`;
    const companyName = tenant?.name ?? 'Your Company';

    // Origin = first pickup stop, Destination = last delivery stop
    const pickupStops = load.stops.filter((s) => s.stopType === 'pickup');
    const deliveryStops = load.stops.filter((s) => s.stopType === 'delivery');
    const originStop = pickupStops[0]?.facility
      ? `${pickupStops[0].facility.name}${pickupStops[0].facility.city ? `, ${pickupStops[0].facility.city}` : ''}${pickupStops[0].facility.state ? ` ${pickupStops[0].facility.state}` : ''}`
      : 'N/A';
    const lastDelivery = deliveryStops[deliveryStops.length - 1];
    const destinationStop = lastDelivery?.facility
      ? `${lastDelivery.facility.name}${lastDelivery.facility.city ? `, ${lastDelivery.facility.city}` : ''}${lastDelivery.facility.state ? ` ${lastDelivery.facility.state}` : ''}`
      : 'N/A';

    const deliveredAt = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-load-delivered',
      entityType: 'load',
      entityId: loadId,
      recipientEmail: owner.email,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: owner.email,
      subject,
      react: React.createElement(LoadDeliveredEmail, {
        loadNumber,
        clientName: load.client.name,
        originStop,
        destinationStop,
        deliveredAt,
        loadDetailUrl,
        companyName,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);

    // Persist in-app notification for the owner portal notification center
    await createNotification({
      orgId,
      type: 'load_delivered',
      title: 'Load Delivered',
      message: `${loadNumber} delivered to ${load.client.name}`,
      entityType: 'load',
      entityId: loadId,
    });

    logger.info('sendLoadDeliveredNotification: sent', { orgId, loadId });
  } catch (err) {
    logger.error('sendLoadDeliveredNotification: failed', { orgId, loadId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendStopCompletedNotification
// ---------------------------------------------------------------------------

export async function sendStopCompletedNotification(
  orgId: string,
  stopId: string
): Promise<void> {
  try {
    const tenantPrisma = await getTenantPrisma();
    const idempotencyKey = `carrier-stop-completed-${stopId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendStopCompletedNotification: no owner found for org', { orgId, stopId });
      return;
    }

    const stop = await tenantPrisma.carrierStop.findFirst({
      where: { id: stopId },
      include: {
        facility: { select: { name: true, city: true, state: true } },
        dispatch: {
          select: {
            id: true,
            notes: true,
            primaryDriverId: true,
            primaryDriver: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!stop) {
      logger.warn('sendStopCompletedNotification: stop not found', { orgId, stopId });
      return;
    }

    const dispatchNumberMatch = stop.dispatch?.notes?.match(
      /\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/
    );
    const dispatchNumber = dispatchNumberMatch
      ? dispatchNumberMatch[1]
      : (stop.dispatchId ?? stopId).slice(0, 8);

    const driverName =
      [stop.dispatch?.primaryDriver?.firstName, stop.dispatch?.primaryDriver?.lastName]
        .filter(Boolean)
        .join(' ') || 'Driver';

    const facilityName = stop.facility
      ? [stop.facility.name, stop.facility.city, stop.facility.state].filter(Boolean).join(', ')
      : 'Unknown Facility';

    const completionTime = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });
    const companyName = tenant?.name ?? 'Your Company';

    const baseUrl = getAppBaseUrl();
    const dispatchDetailUrl = `${baseUrl}/carrier/dispatches/${stop.dispatchId}`;

    const stopTypeLabel = stop.stopType === 'pickup' ? 'pickup' : 'delivery';
    const subject = `Stop Completed - ${facilityName}`;

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-stop-completed',
      entityType: 'dispatch',
      entityId: stop.dispatchId,
      recipientEmail: owner.email,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: owner.email,
      subject,
      react: React.createElement(StopCompletedEmail, {
        driverName,
        stopType: stopTypeLabel,
        facilityName,
        completionTime,
        dispatchNumber,
        companyName,
        dispatchDetailUrl,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);

    // In-app notification for the owner portal notification center
    await createNotification({
      orgId,
      type: 'stop_completed',
      title: 'Stop Completed',
      message: `${driverName} completed ${stopTypeLabel} at ${facilityName}`,
      entityType: 'dispatch',
      entityId: stop.dispatchId,
    });

    // Send push notification to owner (prisma.user kept bare — platform table)
    const ownerUser = await prisma.user.findFirst({
      where: { tenantId: orgId, role: 'OWNER', isActive: true },
      select: { id: true },
    });
    if (ownerUser) {
      await sendPushToUser(ownerUser.id, {
        title: 'Stop Completed',
        body: `${driverName} completed ${stopTypeLabel} at ${facilityName}`,
        data: { type: 'stop_completed', dispatchId: stop.dispatchId, stopId },
      });
    }

    logger.info('sendStopCompletedNotification: sent', { orgId, stopId });
  } catch (err) {
    logger.error('sendStopCompletedNotification: failed', { orgId, stopId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendPayRecordReadyNotification
// ---------------------------------------------------------------------------

export async function sendPayRecordReadyNotification(
  orgId: string,
  payRecordId: string,
  driverName: string,
  dispatchId: string,
  netPay: number
): Promise<void> {
  try {
    const tenantPrisma = await getTenantPrisma();
    const idempotencyKey = `carrier-pay-record-pending-${payRecordId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendPayRecordReadyNotification: no owner found for org', { orgId, payRecordId });
      return;
    }

    // Extract dispatch number from the dispatch notes
    const dispatch = await tenantPrisma.trip.findFirst({
      where: { id: dispatchId, orgId },
      select: { notes: true },
    });
    const dispatchNumberMatch = dispatch?.notes?.match(
      /\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/
    );
    const dispatchNumber = dispatchNumberMatch
      ? dispatchNumberMatch[1]
      : dispatchId.slice(0, 8);

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const now = new Date();
    const payPeriod = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const subject = `Driver Pay Record Ready for Review - ${driverName}`;
    const baseUrl = getAppBaseUrl();
    const payRecordsUrl = `${baseUrl}/carrier/payroll`;
    const companyName = tenant?.name ?? 'Your Company';

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-pay-record-ready',
      entityType: 'pay_record',
      entityId: payRecordId,
      recipientEmail: owner.email,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: owner.email,
      subject,
      react: React.createElement(PayRecordReadyEmail, {
        driverName,
        dispatchNumber,
        payPeriod,
        netPayAmount: netPay,
        payRecordsUrl,
        companyName,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);

    // Persist in-app notification for the owner portal notification center
    await createNotification({
      orgId,
      type: 'pay_record_ready',
      title: 'Pay Record Ready',
      message: `${driverName} — ${dispatchNumber} — $${netPay.toFixed(2)}`,
      entityType: 'driver_pay_record',
      entityId: payRecordId,
    });

    logger.info('sendPayRecordReadyNotification: sent', { orgId, payRecordId, driverName });
  } catch (err) {
    logger.error('sendPayRecordReadyNotification: failed', { orgId, payRecordId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendInvoiceGeneratedNotification
// ---------------------------------------------------------------------------

export async function sendInvoiceGeneratedNotification(
  orgId: string,
  loadId: string
): Promise<void> {
  try {
    const tenantPrisma = await getTenantPrisma();
    const idempotencyKey = `carrier-invoice-generated-${loadId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: loadId, orgId },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            portalAccess: true,
            paymentTerms: true,
            contacts: { select: { name: true, email: true, phone: true, isMain: true } },
          },
        },
        contract: {
          select: {
            contractName: true,
            contractNumber: true,
            paymentTermsOverride: true,
          },
        },
      },
    });

    if (!load) {
      logger.warn('sendInvoiceGeneratedNotification: load not found', { orgId, loadId });
      return;
    }

    const clientEmail = getMainContact(load.client.contacts)?.email ?? load.client.email;
    if (!clientEmail) {
      logger.warn('sendInvoiceGeneratedNotification: client has no email', {
        orgId,
        loadId,
        clientId: load.clientId,
      });
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const loadNumber = load.referenceNumber ?? loadId.slice(0, 8);
    const contractName =
      load.contract?.contractName ??
      load.contract?.contractNumber ??
      load.client.name;

    // Compute due date: paymentTermsOverride (string days) > client.paymentTerms > 30
    const paymentTermsOverrideStr = load.contract?.paymentTermsOverride;
    const paymentTermsDays = paymentTermsOverrideStr
      ? parseInt(paymentTermsOverrideStr, 10) || load.client.paymentTerms
      : load.client.paymentTerms;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    const dueDateStr = dueDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const invoiceTotal = load.totalRevenue ? Number(load.totalRevenue) : 0;
    const baseUrl = getAppBaseUrl();
    const clientPortalUrl = load.client.portalAccess
      ? `${baseUrl}/track/${loadId}`
      : undefined;

    const subject = `Invoice Ready - ${loadNumber} - ${contractName}`;
    const companyName = tenant?.name ?? 'Your Company';

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-invoice-generated',
      entityType: 'load',
      entityId: loadId,
      recipientEmail: clientEmail,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: clientEmail,
      subject,
      react: React.createElement(InvoiceGeneratedEmail, {
        loadNumber,
        contractName,
        invoiceTotal,
        dueDate: dueDateStr,
        clientPortalUrl,
        companyName,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);

    // Persist in-app notification for the owner portal notification center
    await createNotification({
      orgId,
      type: 'invoice_generated',
      title: 'Invoice Generated',
      message: `${loadNumber} — $${invoiceTotal.toFixed(2)} due in ${paymentTermsDays} days`,
      entityType: 'load',
      entityId: loadId,
    });

    logger.info('sendInvoiceGeneratedNotification: sent', { orgId, loadId, clientEmail });
  } catch (err) {
    logger.error('sendInvoiceGeneratedNotification: failed', { orgId, loadId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendComplianceAlertNotifications
// ---------------------------------------------------------------------------

export async function sendComplianceAlertNotifications(
  orgId: string,
  alerts: ComplianceAlert[]
): Promise<void> {
  try {
    if (alerts.length === 0) return;

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Single batch idempotency key per org per day
    const batchKey = `carrier-compliance-batch-${orgId}-${dateStr}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, batchKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendComplianceAlertNotifications: no owner found for org', { orgId });
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const subject = `${alerts.length} Compliance Alert${alerts.length !== 1 ? 's' : ''} Require Attention`;
    const baseUrl = getAppBaseUrl();
    const dashboardUrl = `${baseUrl}/carrier/compliance`;
    const companyName = tenant?.name ?? 'Your Company';

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey: batchKey,
      notificationType: 'carrier-compliance-batch',
      entityType: 'org',
      entityId: orgId,
      recipientEmail: owner.email,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: owner.email,
      subject,
      react: React.createElement(ComplianceAlertEmail, {
        companyName,
        alerts: alerts.map((a) => ({
          type: a.type,
          message: a.message,
          severity: a.severity,
          link: `${baseUrl}${a.link}`,
        })),
        dashboardUrl,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);

    // Persist in-app notifications for the owner portal notification center
    // One notification per alert so each is individually actionable
    for (const alert of alerts) {
      const linkParts = alert.link.split('/');
      let entityType = 'compliance';
      let entityId = orgId;
      if (alert.link.includes('/fleet/drivers/')) {
        entityType = 'driver';
        entityId = linkParts[linkParts.length - 1] || orgId;
      } else if (alert.link.includes('/fleet/trucks/')) {
        entityType = 'truck';
        entityId = linkParts[linkParts.length - 1] || orgId;
      }
      await createNotification({
        orgId,
        type: 'compliance_alert',
        title: 'Compliance Alert',
        message: alert.message,
        entityType,
        entityId,
      });
    }

    logger.info('sendComplianceAlertNotifications: sent', {
      orgId,
      alertCount: alerts.length,
    });
  } catch (err) {
    logger.error('sendComplianceAlertNotifications: failed', { orgId, error: err });
  }
}

// ---------------------------------------------------------------------------
// Client notification helpers
// ---------------------------------------------------------------------------

/** Load data needed for all 3 client notifications */
async function getClientEmailForLoad(orgId: string, loadId: string) {
  const tenantPrisma = await getTenantPrisma();
  return tenantPrisma.carrierLoad.findFirst({
    where: { id: loadId, orgId },
    include: {
      client: {
        select: {
          name: true,
          email: true,
          portalAccess: true,
          portalEmail: true,
          paymentTerms: true,
          contacts: { select: { name: true, email: true, phone: true, isMain: true } },
        },
      },
      contract: {
        select: {
          paymentTermsOverride: true,
        },
      },
      dispatch: {
        select: {
          primaryDriverId: true,
          truckId: true,
          primaryDriver: {
            select: { firstName: true, lastName: true },
          },
          truck: {
            select: { unitNumber: true },
          },
        },
      },
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        include: {
          facility: {
            select: { name: true, city: true, state: true },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// sendClientPickupNotification
// ---------------------------------------------------------------------------

export async function sendClientPickupNotification(
  orgId: string,
  loadId: string,
  completedStopId: string
): Promise<void> {
  const idempotencyKey = `carrier-client-pickup-${loadId}`;

  try {
    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const load = await getClientEmailForLoad(orgId, loadId);
    if (!load) {
      logger.warn('sendClientPickupNotification: load not found', { orgId, loadId });
      return;
    }

    // Only send to clients with portal access
    if (!load.client.portalAccess) return;

    const recipientEmail = getMainContact(load.client.contacts)?.email ?? load.client.email;
    if (!recipientEmail) {
      logger.warn('sendClientPickupNotification: client has no email', { orgId, loadId });
      const logId = await recordNotification(prisma, {
        tenantId: orgId,
        idempotencyKey,
        notificationType: 'carrier-client-pickup',
        entityType: 'load',
        entityId: loadId,
        recipientEmail: 'unknown',
        emailSubject: `Shipment Picked Up - ${load.referenceNumber ?? loadId.slice(0, 8)}`,
      });
      await markNotificationFailed(prisma, logId, 'Client has no email address on file');
      return;
    }

    // TODO E-5: prisma.tenant.findFirst is a platform-level lookup, stays bare
    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const loadNumber = load.referenceNumber ?? loadId.slice(0, 8);
    const companyName = tenant?.name ?? 'Your Company';

    // Find the completed pickup stop
    const completedStop = load.stops.find((s) => s.id === completedStopId);
    const facilityName = completedStop?.facility
      ? [completedStop.facility.name, completedStop.facility.city, completedStop.facility.state]
          .filter(Boolean)
          .join(', ')
      : 'Unknown Facility';

    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const driverName =
      [load.dispatch?.primaryDriver?.firstName, load.dispatch?.primaryDriver?.lastName]
        .filter(Boolean)
        .join(' ') || 'Driver';

    const truckUnitNumber = load.dispatch?.truck?.unitNumber ?? 'N/A';

    const referenceNumbers = [load.bolNumber, load.proNumber, load.poNumber]
      .filter(Boolean)
      .join(' / ');

    const commodity = load.commodityDescription ?? undefined;

    // Find last delivery stop with appointment
    const deliveryStops = load.stops.filter((s) => s.stopType === 'delivery');
    const lastDelivery = deliveryStops[deliveryStops.length - 1];
    const estimatedDelivery = lastDelivery?.appointmentStart
      ? new Date(lastDelivery.appointmentStart).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : undefined;

    const baseUrl = getAppBaseUrl();
    const portalUrl = `${baseUrl}/track/${loadId}`;

    const subject = `Shipment Picked Up - ${loadNumber}`;

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-client-pickup',
      entityType: 'load',
      entityId: loadId,
      recipientEmail,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject,
      react: React.createElement(ClientShipmentUpdateEmail, {
        status: 'picked_up',
        loadNumber,
        companyName,
        facilityName,
        timestamp,
        driverName,
        truckUnitNumber,
        referenceNumbers,
        commodity,
        estimatedDelivery,
        portalUrl,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);
    logger.info('sendClientPickupNotification: sent', { orgId, loadId, recipientEmail });
  } catch (err) {
    logger.error('sendClientPickupNotification: failed', { orgId, loadId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendClientDeliveredNotification
// ---------------------------------------------------------------------------

export async function sendClientDeliveredNotification(
  orgId: string,
  loadId: string
): Promise<void> {
  const idempotencyKey = `carrier-client-delivered-${loadId}`;

  try {
    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const load = await getClientEmailForLoad(orgId, loadId);
    if (!load) {
      logger.warn('sendClientDeliveredNotification: load not found', { orgId, loadId });
      return;
    }

    // Only send to clients with portal access
    if (!load.client.portalAccess) return;

    const recipientEmail = getMainContact(load.client.contacts)?.email ?? load.client.email;
    if (!recipientEmail) {
      logger.warn('sendClientDeliveredNotification: client has no email', { orgId, loadId });
      const logId = await recordNotification(prisma, {
        tenantId: orgId,
        idempotencyKey,
        notificationType: 'carrier-client-delivered',
        entityType: 'load',
        entityId: loadId,
        recipientEmail: 'unknown',
        emailSubject: `Shipment Delivered - ${load.referenceNumber ?? loadId.slice(0, 8)}`,
      });
      await markNotificationFailed(prisma, logId, 'Client has no email address on file');
      return;
    }

    // TODO E-5: prisma.tenant.findFirst is a platform-level lookup, stays bare
    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const loadNumber = load.referenceNumber ?? loadId.slice(0, 8);
    const companyName = tenant?.name ?? 'Your Company';

    // Find last delivery stop
    const deliveryStops = load.stops.filter((s) => s.stopType === 'delivery');
    const lastDelivery = deliveryStops[deliveryStops.length - 1];

    const facilityName = lastDelivery?.facility
      ? [lastDelivery.facility.name, lastDelivery.facility.city, lastDelivery.facility.state]
          .filter(Boolean)
          .join(', ')
      : 'Unknown Facility';

    const timestamp = lastDelivery?.departedAt
      ? new Date(lastDelivery.departedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

    const driverName =
      [load.dispatch?.primaryDriver?.firstName, load.dispatch?.primaryDriver?.lastName]
        .filter(Boolean)
        .join(' ') || 'Driver';

    const truckUnitNumber = load.dispatch?.truck?.unitNumber ?? 'N/A';

    const referenceNumbers = [load.bolNumber, load.proNumber, load.poNumber]
      .filter(Boolean)
      .join(' / ');

    // Check if POD document exists for last delivery stop
    let podNote: string | undefined;
    if (lastDelivery) {
      const tenantPrisma = await getTenantPrisma();
      const podCount = await tenantPrisma.carrierDocument.count({
        where: { stopId: lastDelivery.id, documentType: 'pod' },
      });
      if (podCount > 0) {
        podNote = 'Proof of Delivery document has been uploaded';
      }
    }

    const baseUrl = getAppBaseUrl();
    const portalUrl = `${baseUrl}/track/${loadId}`;

    const subject = `Shipment Delivered - ${loadNumber}`;

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-client-delivered',
      entityType: 'load',
      entityId: loadId,
      recipientEmail,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject,
      react: React.createElement(ClientShipmentUpdateEmail, {
        status: 'delivered',
        loadNumber,
        companyName,
        facilityName,
        timestamp,
        driverName,
        truckUnitNumber,
        referenceNumbers,
        commodity: load.commodityDescription ?? undefined,
        podNote,
        portalUrl,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);
    logger.info('sendClientDeliveredNotification: sent', { orgId, loadId, recipientEmail });
  } catch (err) {
    logger.error('sendClientDeliveredNotification: failed', { orgId, loadId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendClientInvoiceReadyNotification
// ---------------------------------------------------------------------------

export async function sendClientInvoiceReadyNotification(
  orgId: string,
  loadId: string
): Promise<void> {
  const idempotencyKey = `carrier-client-invoice-${loadId}`;

  try {
    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const load = await getClientEmailForLoad(orgId, loadId);
    if (!load) {
      logger.warn('sendClientInvoiceReadyNotification: load not found', { orgId, loadId });
      return;
    }

    // Invoice notifications always send — do NOT check portalAccess
    const recipientEmail = getMainContact(load.client.contacts)?.email ?? load.client.email;
    if (!recipientEmail) {
      logger.warn('sendClientInvoiceReadyNotification: client has no email', { orgId, loadId });
      const logId = await recordNotification(prisma, {
        tenantId: orgId,
        idempotencyKey,
        notificationType: 'carrier-client-invoice-ready',
        entityType: 'load',
        entityId: loadId,
        recipientEmail: 'unknown',
        emailSubject: `Invoice Ready - ${load.referenceNumber ?? loadId.slice(0, 8)}`,
      });
      await markNotificationFailed(prisma, logId, 'Client has no email address on file');
      return;
    }

    // TODO E-5: prisma.tenant.findFirst is a platform-level lookup, stays bare
    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    const loadNumber = load.referenceNumber ?? loadId.slice(0, 8);
    const companyName = tenant?.name ?? 'Your Company';

    const invoiceTotal = load.totalRevenue ? Number(load.totalRevenue) : 0;

    // Compute payment terms: contract override > client terms > 30
    const paymentTermsOverrideStr = load.contract?.paymentTermsOverride;
    const paymentTermsDays = paymentTermsOverrideStr
      ? parseInt(paymentTermsOverrideStr, 10) || load.client.paymentTerms
      : load.client.paymentTerms;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    const dueDateStr = dueDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Build line items summary from load fields
    const lineItems: string[] = ['Linehaul'];
    if (load.fuelSurcharge && Number(load.fuelSurcharge) > 0) lineItems.push('Fuel Surcharge');
    if (load.detentionAmount && Number(load.detentionAmount) > 0) lineItems.push('Detention');
    if (load.otherCharges && Number(load.otherCharges) > 0) lineItems.push('Other Charges');
    const lineItemsSummary = lineItems.join(', ');

    const baseUrl = getAppBaseUrl();
    const portalUrl = load.client.portalAccess ? `${baseUrl}/track/${loadId}` : undefined;

    const subject = `Invoice Ready - ${loadNumber} - $${invoiceTotal.toFixed(2)}`;

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-client-invoice-ready',
      entityType: 'load',
      entityId: loadId,
      recipientEmail,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject,
      react: React.createElement(ClientInvoiceReadyEmail, {
        loadNumber,
        companyName,
        invoiceTotal,
        dueDate: dueDateStr,
        lineItemsSummary,
        portalUrl,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);
    logger.info('sendClientInvoiceReadyNotification: sent', { orgId, loadId, recipientEmail });
  } catch (err) {
    logger.error('sendClientInvoiceReadyNotification: failed', { orgId, loadId, error: err });
  }
}

// ---------------------------------------------------------------------------
// sendTripChangeNotification - Notify driver of trip changes (stops, loads)
// ---------------------------------------------------------------------------

export type TripChangeType = 'stop_added' | 'stop_updated' | 'stop_removed' | 'load_added' | 'load_removed';

export async function sendTripChangeNotification(
  orgId: string,
  dispatchId: string,
  changeType: TripChangeType,
  details?: string
): Promise<{ notified: boolean; driverName: string | null }> {
  try {
    const tenantPrisma = await getTenantPrisma();
    // Fetch dispatch with driver info
    const dispatch = await tenantPrisma.trip.findFirst({
      where: { id: dispatchId, orgId },
      select: {
        notes: true,
        status: true,
        primaryDriverId: true,
        primaryDriver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
          },
        },
      },
    });

    if (!dispatch) {
      logger.warn('sendTripChangeNotification: dispatch not found', { orgId, dispatchId });
      return { notified: false, driverName: null };
    }

    // Only notify for active trips (planned or in_progress)
    if (!['planned', 'in_progress'].includes(dispatch.status)) {
      return { notified: false, driverName: null };
    }

    const driverName = dispatch.primaryDriver
      ? `${dispatch.primaryDriver.firstName} ${dispatch.primaryDriver.lastName}`.trim()
      : null;

    if (!dispatch.primaryDriver?.userId) {
      logger.info('sendTripChangeNotification: driver has no userId, skipping push', { orgId, dispatchId });
      return { notified: false, driverName };
    }

    // Extract dispatch number
    const dispatchNumberMatch = dispatch.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
    const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : dispatchId.slice(0, 8);

    // Build notification message based on change type
    const changeMessages: Record<TripChangeType, { title: string; body: string }> = {
      stop_added: {
        title: 'New Stop Added',
        body: details ? `${dispatchNumber}: ${details}` : `A new stop has been added to ${dispatchNumber}`,
      },
      stop_updated: {
        title: 'Stop Updated',
        body: details ? `${dispatchNumber}: ${details}` : `Stop details updated on ${dispatchNumber}`,
      },
      stop_removed: {
        title: 'Stop Removed',
        body: details ? `${dispatchNumber}: ${details}` : `A stop has been removed from ${dispatchNumber}`,
      },
      load_added: {
        title: 'Load Added',
        body: details ? `${dispatchNumber}: ${details}` : `A new load has been added to ${dispatchNumber}`,
      },
      load_removed: {
        title: 'Load Removed',
        body: details ? `${dispatchNumber}: ${details}` : `A load has been removed from ${dispatchNumber}`,
      },
    };

    const message = changeMessages[changeType];

    // Send push notification
    await sendPushToUser(dispatch.primaryDriver.userId, {
      title: message.title,
      body: message.body,
      data: { type: 'trip_change', dispatchId, changeType },
    });

    // Create in-app notification for driver
    await createNotification({
      orgId,
      userId: dispatch.primaryDriver.userId,
      type: 'trip_change',
      title: message.title,
      message: message.body,
      entityType: 'dispatch',
      entityId: dispatchId,
    });

    logger.info('sendTripChangeNotification: sent', { orgId, dispatchId, changeType, driverId: dispatch.primaryDriverId });

    return { notified: true, driverName };
  } catch (err) {
    logger.error('sendTripChangeNotification: failed', { orgId, dispatchId, changeType, error: err });
    return { notified: false, driverName: null };
  }
}
