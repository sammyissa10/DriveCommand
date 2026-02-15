/**
 * Send maintenance reminder email via Resend.
 */

import { resend, FROM_EMAIL } from './resend-client';
import { MaintenanceReminderEmail } from '@/emails/maintenance-reminder';

export interface MaintenanceReminderProps {
  truckName: string;
  serviceType: string;
  dueDate: string;
  dueMileage: number | null;
  currentMileage: number;
  milesRemaining: number | null;
  dashboardUrl: string;
}

/**
 * Send maintenance reminder email.
 * Throws error if send fails.
 */
export async function sendMaintenanceReminder(
  toEmail: string,
  data: MaintenanceReminderProps
): Promise<{ id: string }> {
  const subject = `Maintenance Due: ${data.serviceType} - ${data.truckName}`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject,
    react: MaintenanceReminderEmail(data),
  });

  if (!result.data?.id) {
    throw new Error(`Failed to send maintenance reminder email: ${result.error?.message || 'Unknown error'}`);
  }

  return { id: result.data.id };
}
