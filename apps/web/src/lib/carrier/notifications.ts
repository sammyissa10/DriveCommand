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
import { DispatchAssignedEmail } from '@/emails/carrier/dispatch-assigned';
import { LoadDeliveredEmail } from '@/emails/carrier/load-delivered';
import { PayRecordReadyEmail } from '@/emails/carrier/pay-record-ready';
import { InvoiceGeneratedEmail } from '@/emails/carrier/invoice-generated';
import { ComplianceAlertEmail } from '@/emails/carrier/compliance-alert';

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
  try {
    const idempotencyKey = `carrier-dispatch-assigned-${dispatchId}-${driverId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const driverEmail = await getDriverEmail(driverId);
    if (!driverEmail) {
      logger.warn('sendDispatchAssignedNotification: driver has no email', {
        orgId,
        dispatchId,
        driverId,
      });
      return;
    }

    const dispatch = await prisma.carrierDispatch.findFirst({
      where: { id: dispatchId, orgId },
      include: {
        truck: { select: { unitNumber: true } },
        _count: { select: { stops: true } },
      },
    });

    if (!dispatch) {
      logger.warn('sendDispatchAssignedNotification: dispatch not found', { orgId, dispatchId });
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: orgId },
      select: { name: true },
    });

    // Extract dispatch number from notes
    const dispatchNumberMatch = dispatch.notes?.match(
      /\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/
    );
    const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : dispatchId.slice(0, 8);

    const subject = `New Dispatch Assigned - ${dispatchNumber}`;
    const baseUrl = getAppBaseUrl();
    const driverPortalUrl = `${baseUrl}/driver/dispatches/${dispatchId}`;
    const companyName = tenant?.name ?? 'Your Company';

    const scheduledDeparture = dispatch.scheduledDeparture
      ? new Date(dispatch.scheduledDeparture).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : 'TBD';

    const logId = await recordNotification(prisma, {
      tenantId: orgId,
      idempotencyKey,
      notificationType: 'carrier-dispatch-assigned',
      entityType: 'dispatch',
      entityId: dispatchId,
      recipientEmail: driverEmail,
      emailSubject: subject,
    });

    const result = await sendEmail({
      to: driverEmail,
      subject,
      react: React.createElement(DispatchAssignedEmail, {
        dispatchNumber,
        scheduledDeparture,
        stopCount: dispatch._count.stops,
        truckUnitNumber: dispatch.truck.unitNumber,
        driverPortalUrl,
        companyName,
      }),
    });

    await markNotificationSent(prisma, logId, result.id);
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
    const idempotencyKey = `carrier-load-delivered-${loadId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendLoadDeliveredNotification: no owner found for org', { orgId, loadId });
      return;
    }

    const load = await prisma.carrierLoad.findFirst({
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
    logger.info('sendLoadDeliveredNotification: sent', { orgId, loadId });
  } catch (err) {
    logger.error('sendLoadDeliveredNotification: failed', { orgId, loadId, error: err });
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
    const idempotencyKey = `carrier-pay-record-pending-${payRecordId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const owner = await getOwnerEmail(orgId);
    if (!owner) {
      logger.warn('sendPayRecordReadyNotification: no owner found for org', { orgId, payRecordId });
      return;
    }

    // Extract dispatch number from the dispatch notes
    const dispatch = await prisma.carrierDispatch.findFirst({
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
    const idempotencyKey = `carrier-invoice-generated-${loadId}`;

    const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
    if (alreadySent) return;

    const load = await prisma.carrierLoad.findFirst({
      where: { id: loadId, orgId },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            portalAccess: true,
            paymentTerms: true,
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

    const clientEmail = load.client.email;
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
    logger.info('sendComplianceAlertNotifications: sent', {
      orgId,
      alertCount: alerts.length,
    });
  } catch (err) {
    logger.error('sendComplianceAlertNotifications: failed', { orgId, error: err });
  }
}
