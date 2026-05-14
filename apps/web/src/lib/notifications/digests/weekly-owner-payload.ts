/**
 * Weekly owner digest payload builder.
 *
 * Accepts a pre-scoped tenantPrisma client (already extended with withTenantRLS)
 * from the caller.
 *
 * Returns null when the tenant had no loads in the preceding week,
 * which signals the cron route to skip dispatch for that recipient.
 */

import type { NotificationPayload } from '@/lib/notifications/types';
import Decimal from 'decimal.js';

/**
 * Build a weekly owner digest payload covering the Mon–Sun week ending before weekStart.
 *
 * @param tenantPrisma - A tenant-scoped Prisma client (caller must provide; see cron route).
 * @param tenantId - Tenant ID (used for scoping queries).
 * @param ownerUserId - The user ID of the owner recipient.
 * @param weekStart - The start of the week window (typically today; Mon–Sun computed from here).
 * @returns Typed payload or null if there are no loads to report.
 */
export async function buildWeeklyOwnerPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantPrisma: any,
  tenantId: string,
  ownerUserId: string,
  weekStart: Date,
): Promise<NotificationPayload['digest.weekly_owner'] | null> {
  // Compute Mon–Sun of the preceding week
  const now = new Date(weekStart);
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  // How many days since last Monday (or 7 if today is Monday, to get the previous week)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 7);

  const weekRangeStr = `${lastMonday.toISOString().slice(0, 10)} to ${new Date(lastSunday.getTime() - 1).toISOString().slice(0, 10)}`;

  const [loads, user] = await Promise.all([
    tenantPrisma.load.findMany({
      where: {
        tenantId,
        pickupDate: { gte: lastMonday, lt: lastSunday },
        archivedAt: null,
      },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        rate: true,
        origin: true,
        destination: true,
      },
    }),
    tenantPrisma.user.findUnique({
      where: { id: ownerUserId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  if (loads.length === 0) {
    return null;
  }

  const ownerName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Owner'
    : 'Owner';

  const totalRevenue = loads.reduce(
    (sum: Decimal, l: { rate: unknown }) => sum.plus(new Decimal(l.rate?.toString() ?? '0')),
    new Decimal(0),
  );

  const summaryHtml = `<ul>${loads.map((l: { loadNumber: string; status: string; origin: string; destination: string; rate: unknown }) =>
    `<li>Load ${l.loadNumber} (${l.status}): ${l.origin} → ${l.destination} — $${new Decimal(l.rate?.toString() ?? '0').toFixed(2)}</li>`
  ).join('')}</ul>`;

  return {
    ownerName,
    weekRange: weekRangeStr,
    loadCount: String(loads.length),
    revenue: `$${totalRevenue.toFixed(2)}`,
    summaryHtml,
  };
}
