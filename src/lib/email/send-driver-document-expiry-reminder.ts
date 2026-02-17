/**
 * Send driver document expiry reminder email via Resend.
 */

import { resend, FROM_EMAIL } from './resend-client';
import { DriverDocumentExpiryReminderEmail } from '@/emails/driver-document-expiry-reminder';

export interface DriverDocumentExpiryReminderProps {
  driverName: string;
  documentType: string; // Human-readable
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
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
 * Throws error if send fails.
 */
export async function sendDriverDocumentExpiryReminder(
  toEmail: string,
  data: DriverDocumentExpiryReminderProps
): Promise<{ id: string }> {
  const urgency = data.daysUntilExpiry < 0
    ? 'EXPIRED'
    : data.daysUntilExpiry <= 7
    ? 'URGENT'
    : 'Expiring Soon';
  const subject = `${urgency}: Driver ${data.documentType} - ${data.driverName}`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject,
    react: DriverDocumentExpiryReminderEmail(data),
  });

  if (!result.data?.id) {
    throw new Error(`Failed to send driver document expiry reminder email: ${result.error?.message || 'Unknown error'}`);
  }

  return { id: result.data.id };
}
