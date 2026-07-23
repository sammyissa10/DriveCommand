/**
 * Daily driver digest payload builder.
 *
 * Accepts a pre-scoped tenantPrisma client (already extended with withTenantRLS)
 * from the caller. This avoids double-RLS-wrapping and keeps the builder testable.
 *
 * Returns null when the driver has no loads, stops, or HOS events for the given date,
 * which signals the cron route to skip dispatch for that recipient.
 */

import type { NotificationPayload } from '@/lib/notifications/types';

/**
 * Build a daily driver digest payload for a specific driver and date.
 *
 * @param tenantPrisma - A tenant-scoped Prisma client (caller must provide; see cron route).
 * @param tenantId - Tenant ID (used for scoping queries).
 * @param driverUserId - The user ID of the driver recipient.
 * @param date - The date to build the digest for (typically today in UTC).
 * @returns Typed payload or null if there is nothing to report.
 */
export async function buildDailyDriverPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantPrisma: any,
  tenantId: string,
  driverUserId: string,
  date: Date,
): Promise<NotificationPayload['digest.daily_driver'] | null> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Fetch loads for this driver on this date
  const [loads, hosEntries, user] = await Promise.all([
    tenantPrisma.load.findMany({
      where: {
        tenantId,
        driverId: driverUserId,
        pickupDate: { gte: dayStart, lt: dayEnd },
        archivedAt: null,
      },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        origin: true,
        destination: true,
      },
    }),
    tenantPrisma.driverHOSEntry.findMany({
      where: {
        driverId: driverUserId,
        startTime: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, status: true },
    }),
    tenantPrisma.user.findUnique({
      where: { id: driverUserId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  // Return null if nothing to report
  if (loads.length === 0 && hosEntries.length === 0) {
    return null;
  }

  const driverName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Driver'
    : 'Driver';

  const summaryHtml = loads.length > 0
    ? `<ul>${loads.map((l: { loadNumber: string; status: string; origin: string; destination: string }) =>
        `<li>Load ${l.loadNumber} (${l.status}): ${l.origin} → ${l.destination}</li>`
      ).join('')}</ul>`
    : '<p>No loads scheduled today.</p>';

  return {
    driverName,
    date: date.toISOString().slice(0, 10),
    loadCount: String(loads.length),
    summaryHtml,
  };
}
