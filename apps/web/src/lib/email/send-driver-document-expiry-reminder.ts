/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './gmail-client';
import { DriverDocumentExpiryReminderEmail } from '@/emails/driver-document-expiry-reminder';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface DriverDocumentExpiryReminderProps {
  driverName: string;
  documentType: string; // Human-readable
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
  /** Optional: if provided, routes through dispatchNotification. */
  tenantId?: string;
  /** Optional: driver ID for the relatedEntity. */
  driverId?: string;
}

/**
 * Convert DocumentType enum to human-readable format.
 */
export function formatDocumentType(type: string): string {
  switch (type) {
    case 'DRIVER_LICENSE':
      return 'Driver License';
    case 'DRIVER_APPLICATION':
      return 'Driver Application';
    case 'GENERAL':
      return 'General Document';
    default:
      return type;
  }
}

/**
 * Send driver document expiry reminder email.
 * Routes through dispatchNotification when tenantId is available; falls back to
 * legacy Gmail SMTP on dispatcher error.
 */
export async function sendDriverDocumentExpiryReminder(
  toEmail: string,
  data: DriverDocumentExpiryReminderProps
): Promise<{ id: string }> {
  try {
    if (!data.tenantId) {
      return await legacySendDriverDocumentExpiryReminder(toEmail, data);
    }
    const result = await dispatchNotification('driver.license_expiring', {
      tenantId: data.tenantId,
      payload: {
        driverId: data.driverId ?? '',
        driverName: data.driverName,
        licenseType: data.documentType,
        expiresAt: data.expiryDate,
        daysUntilExpiry: String(data.daysUntilExpiry),
      },
      relatedEntity: { type: 'Document', id: data.driverId ?? '' },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendDriverDocumentExpiryReminder(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendDriverDocumentExpiryReminder(
  toEmail: string,
  data: DriverDocumentExpiryReminderProps
): Promise<{ id: string }> {
  const urgency = data.daysUntilExpiry < 0
    ? 'EXPIRED'
    : data.daysUntilExpiry <= 7
    ? 'URGENT'
    : 'Expiring Soon';
  const subject = `${urgency}: Driver ${data.documentType} - ${data.driverName}`;

  return sendEmail({
    to: toEmail,
    subject,
    react: DriverDocumentExpiryReminderEmail(data),
  });
}
