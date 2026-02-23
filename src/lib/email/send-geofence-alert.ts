import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { resend, FROM_EMAIL } from './resend-client';
import { GeofenceArrivalAlert } from '@/emails/geofence-arrival-alert';

export interface GeofenceAlertData {
  tenantId: string;
  loadId: string;
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
}

/**
 * Send arrival alert to all OWNER and MANAGER users in the tenant.
 * Throws on failure so caller can catch and log.
 */
export async function sendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
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

  await resend.emails.send({
    from: FROM_EMAIL,
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
