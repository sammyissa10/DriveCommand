/**
 * 30-day compliance digest payload builder.
 *
 * Accepts a pre-scoped tenantPrisma client (already extended with withTenantRLS)
 * from the caller.
 *
 * Returns null when there are no truck or driver documents expiring within 30 days,
 * which signals the cron route to skip dispatch for that recipient.
 */

import type { NotificationPayload } from '@/lib/notifications/types';

/**
 * Build a compliance 30-day digest payload for documents expiring within the next 30 days.
 *
 * @param tenantPrisma - A tenant-scoped Prisma client (caller must provide; see cron route).
 * @param tenantId - Tenant ID (used for scoping queries).
 * @param ownerUserId - The user ID of the owner recipient.
 * @returns Typed payload or null if no documents are expiring within 30 days.
 */
export async function buildCompliance30DayPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantPrisma: any,
  tenantId: string,
  ownerUserId: string,
): Promise<NotificationPayload['digest.compliance_30day'] | null> {
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(now.getDate() + 30);

  const [truckDocs, driverDocs, user] = await Promise.all([
    // Truck documents expiring within 30 days
    tenantPrisma.document.findMany({
      where: {
        tenantId,
        truckId: { not: null },
        driverId: null,
        expiryDate: { gte: now, lte: in30Days },
      },
      select: {
        id: true,
        documentType: true,
        expiryDate: true,
        truck: { select: { unitNumber: true } },
      },
    }),
    // Driver documents expiring within 30 days
    tenantPrisma.document.findMany({
      where: {
        tenantId,
        driverId: { not: null },
        expiryDate: { gte: now, lte: in30Days },
      },
      select: {
        id: true,
        documentType: true,
        expiryDate: true,
        driver: { select: { firstName: true, lastName: true } },
      },
    }),
    tenantPrisma.user.findUnique({
      where: { id: ownerUserId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const totalExpiring = truckDocs.length + driverDocs.length;

  if (totalExpiring === 0) {
    return null;
  }

  const ownerName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Owner'
    : 'Owner';

  const truckItems = truckDocs.map((d: {
    documentType: string | null;
    expiryDate: Date | null;
    truck: { unitNumber: string } | null;
  }) =>
    `<li>Truck ${d.truck?.unitNumber ?? 'Unknown'}: ${d.documentType ?? 'Document'} expires ${d.expiryDate?.toLocaleDateString() ?? 'N/A'}</li>`
  );

  const driverItems = driverDocs.map((d: {
    documentType: string | null;
    expiryDate: Date | null;
    driver: { firstName: string | null; lastName: string | null } | null;
  }) => {
    const driverName = d.driver
      ? `${d.driver.firstName ?? ''} ${d.driver.lastName ?? ''}`.trim()
      : 'Unknown Driver';
    return `<li>Driver ${driverName}: ${d.documentType ?? 'Document'} expires ${d.expiryDate?.toLocaleDateString() ?? 'N/A'}</li>`;
  });

  const summaryHtml = `<ul>${[...truckItems, ...driverItems].join('')}</ul>`;

  return {
    ownerName,
    expiringDocCount: String(totalExpiring),
    summaryHtml,
  };
}
