import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/driver/messages/unread-count
 *
 * Returns the number of non-driver messages sent after a given timestamp.
 * Query param: since=<ISO timestamp> (the driver's last-read time)
 * If no `since` param is provided, counts messages from the last 7 days.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  const sinceParam = req.nextUrl.searchParams.get('since');
  let since: Date;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    since = isNaN(parsed.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : parsed;
  } else {
    // Default: count unread from last 7 days
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  try {
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const count = await tenantPrisma.$transaction(async (tx) => {
      // Find all loads assigned to this driver
      const driverLoads = await tx.load.findMany({
        where: { driverId, tenantId },
        select: { id: true },
      });

      const loadIds = driverLoads.map((l) => l.id);

      // Count messages from non-drivers in the driver's load conversations, newer than `since`
      return tx.fleetMessage.count({
        where: {
          tenantId,
          senderRole: { not: 'DRIVER' },
          createdAt: { gt: since },
          OR: [
            { loadId: { in: loadIds } },
          ],
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ count });
  } catch (err) {
    logger.error('[mobile/driver/messages/unread-count] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
