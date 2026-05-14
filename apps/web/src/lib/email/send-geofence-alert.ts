/**
 * WRAPPER (Phase 41 Cleanup quick-322): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacySendGeofenceAlert` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendEmail } from './gmail-client';
import { GeofenceArrivalAlert } from '@/emails/geofence-arrival-alert';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface GeofenceAlertData {
  tenantId: string;        // already required — keep required
  loadId: string;
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
}

/**
 * Send geofence arrival alert to dispatchers.
 * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
 * the dispatcher itself throws.
 */
export async function sendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
  try {
    await dispatchNotification('geofence.alert', {
      tenantId: data.tenantId,
      payload: {
        loadId: data.loadId,
        loadNumber: data.loadNumber,
        stopType: data.stopType,
        stopAddress: data.stopAddress,
        driverName: data.driverName,
        licensePlate: data.licensePlate,
      },
      relatedEntity: { type: 'Load', id: data.loadId },
    });
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy geofence sender', err);
    await legacySendGeofenceAlert(data);
  }
}

/** Legacy implementation — preserved as fallback. Original Phase-20 code. */
async function legacySendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
  // Find dispatcher email addresses (bypass RLS — called from non-session context)
  const dispatchers = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findMany({
      where: {
        tenantId: data.tenantId,
        role: { in: ['OWNER', 'MANAGER'] },
        isActive: true,
      },
      select: { email: true },
    });
  }, TX_OPTIONS);

  if (!dispatchers.length) return;

  const loadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${data.loadId}`;
  const stopLabel = data.stopType === 'pickup' ? 'Pickup' : 'Delivery';
  const subject = `Truck arrived at ${stopLabel} — Load ${data.loadNumber}`;

  const emails = dispatchers.map((d) => d.email);

  await sendEmail({
    to: emails,
    subject,
    react: GeofenceArrivalAlert({
      loadNumber: data.loadNumber,
      stopType: data.stopType,
      stopAddress: data.stopAddress,
      driverName: data.driverName,
      licensePlate: data.licensePlate,
      loadUrl,
    }),
  });
}
