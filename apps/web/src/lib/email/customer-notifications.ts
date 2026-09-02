/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './resend-client';
import { LoadStatusNotificationEmail } from '@/emails/load-status-notification';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

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
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
  /** Optional: load ID for the relatedEntity. */
  loadId?: string;
  /** Optional: delivered timestamp (used when status=DELIVERED). */
  deliveredAt?: string;
}

const STATUS_LABELS: Record<string, string> = {
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
};

/** Statuses that use the tracking_link_sent trigger. */
const IN_TRANSIT_STATUSES = new Set(['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT']);

/**
 * Send a load status notification email to a customer.
 * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
 * the dispatcher itself throws.
 */
export async function sendLoadStatusEmail(
  toEmail: string,
  data: LoadStatusEmailData
): Promise<{ id: string }> {
  try {
    const isDelivered = data.status === 'DELIVERED';
    const triggerKey = isDelivered
      ? ('customer.delivered_notification' as const)
      : ('customer.tracking_link_sent' as const);

    if (isDelivered) {
      const result = await dispatchNotification('customer.delivered_notification', {
        tenantId: data.tenantId,
        payload: {
          customerEmail: toEmail,
          customerName: data.customerName,
          loadNumber: data.loadNumber,
          deliveredAt: data.deliveredAt ?? new Date().toISOString(),
        },
        relatedEntity: { type: 'Load', id: data.loadId ?? '' },
      });
      return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
    }

    if (IN_TRANSIT_STATUSES.has(data.status)) {
      const result = await dispatchNotification('customer.tracking_link_sent', {
        tenantId: data.tenantId,
        payload: {
          customerEmail: toEmail,
          customerName: data.customerName,
          loadNumber: data.loadNumber,
          trackingUrl: data.trackingUrl,
        },
        relatedEntity: { type: 'Load', id: data.loadId ?? '' },
      });
      return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
    }

    // Unknown status — fall through to legacy
    return await legacySendLoadStatusEmail(toEmail, data);
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendLoadStatusEmail(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendLoadStatusEmail(
  toEmail: string,
  data: LoadStatusEmailData
): Promise<{ id: string }> {
  const statusLabel = STATUS_LABELS[data.status] || data.status;
  const subject = `Load ${data.loadNumber} — ${statusLabel}`;

  return sendEmail({
    to: toEmail,
    subject,
    react: LoadStatusNotificationEmail(data),
  });
}
