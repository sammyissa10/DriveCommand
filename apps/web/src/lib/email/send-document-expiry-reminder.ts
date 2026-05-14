/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './gmail-client';
import { DocumentExpiryReminderEmail } from '@/emails/document-expiry-reminder';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface DocumentExpiryReminderProps {
  truckName: string;
  documentType: string; // "Registration" or "Insurance"
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
  /** Optional: truck ID for the relatedEntity. */
  truckId?: string;
}

/**
 * Send document expiry reminder email.
 * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
 * the dispatcher itself throws.
 */
export async function sendDocumentExpiryReminder(
  toEmail: string,
  data: DocumentExpiryReminderProps
): Promise<{ id: string }> {
  try {
    const result = await dispatchNotification('truck.document_expiring', {
      tenantId: data.tenantId,
      payload: {
        truckId: data.truckId ?? '',
        unitNumber: data.truckName,
        documentType: data.documentType,
        expiresAt: data.expiryDate,
      },
      relatedEntity: { type: 'Truck', id: data.truckId ?? '' },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendDocumentExpiryReminder(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendDocumentExpiryReminder(
  toEmail: string,
  data: DocumentExpiryReminderProps
): Promise<{ id: string }> {
  const urgency = data.daysUntilExpiry < 0 ? 'EXPIRED' : data.daysUntilExpiry < 7 ? 'URGENT' : 'Expiring Soon';
  const subject = `${urgency}: ${data.documentType} - ${data.truckName}`;

  return sendEmail({
    to: toEmail,
    subject,
    react: DocumentExpiryReminderEmail(data),
  });
}
