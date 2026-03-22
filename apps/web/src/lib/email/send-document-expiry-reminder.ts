/**
 * Send document expiry reminder email via Gmail SMTP.
 */

import { sendEmail } from './gmail-client';
import { DocumentExpiryReminderEmail } from '@/emails/document-expiry-reminder';

export interface DocumentExpiryReminderProps {
  truckName: string;
  documentType: string; // "Registration" or "Insurance"
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
}

/**
 * Send document expiry reminder email.
 * Throws error if send fails.
 */
export async function sendDocumentExpiryReminder(
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
