/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './gmail-client';
import { MaintenanceReminderEmail } from '@/emails/maintenance-reminder';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface MaintenanceReminderProps {
  truckName: string;
  serviceType: string;
  dueDate: string;
  dueMileage: number | null;
  currentMileage: number;
  milesRemaining: number | null;
  dashboardUrl: string;
  /** Optional: if provided, routes through dispatchNotification. */
  tenantId?: string;
  /** Optional: truck ID for the relatedEntity. */
  truckId?: string;
}

/**
 * Send maintenance reminder email.
 * Routes through dispatchNotification when tenantId is available; falls back to
 * legacy Gmail SMTP on dispatcher error.
 */
export async function sendMaintenanceReminder(
  toEmail: string,
  data: MaintenanceReminderProps
): Promise<{ id: string }> {
  try {
    if (!data.tenantId) {
      return await legacySendMaintenanceReminder(toEmail, data);
    }
    const result = await dispatchNotification('truck.maintenance_due', {
      tenantId: data.tenantId,
      payload: {
        truckId: data.truckId ?? '',
        unitNumber: data.truckName,
        maintenanceType: data.serviceType,
        dueAt: data.dueDate,
      },
      relatedEntity: { type: 'Truck', id: data.truckId ?? '' },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendMaintenanceReminder(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendMaintenanceReminder(
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
