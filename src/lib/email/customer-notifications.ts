/**
 * Send load status notification emails to customers via Resend.
 */

import { resend, FROM_EMAIL } from './resend-client';
import { LoadStatusNotificationEmail } from '@/emails/load-status-notification';

export interface LoadStatusEmailData {
  customerName: string;
  loadNumber: string;
  status: string;
  origin: string;
  destination: string;
  driverName: string;
  truckInfo: string;
  estimatedDelivery?: string;
  trackingUrl: string;
}

const STATUS_LABELS: Record<string, string> = {
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
};

/**
 * Send a load status notification email to a customer.
 * Throws error if send fails.
 */
export async function sendLoadStatusEmail(
  toEmail: string,
  data: LoadStatusEmailData
): Promise<{ id: string }> {
  const statusLabel = STATUS_LABELS[data.status] || data.status;
  const subject = `Load ${data.loadNumber} \u2014 ${statusLabel}`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject,
    react: LoadStatusNotificationEmail(data),
  });

  if (!result.data?.id) {
    throw new Error(
      `Failed to send load status notification email: ${result.error?.message || 'Unknown error'}`
    );
  }

  return { id: result.data.id };
}
