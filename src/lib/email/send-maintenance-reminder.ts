/**
 * Send maintenance reminder email via Gmail SMTP.
 */

import { sendEmail } from './gmail-client';
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

  return sendEmail({
    to: toEmail,
    subject,
    react: MaintenanceReminderEmail(data),
  });
}
