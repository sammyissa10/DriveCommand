/**
 * GET /api/driver-pay/me/current-period
 *
 * Returns the authenticated driver's unsettled assignments in the current period
 * (payStatus PENDING_REVIEW or APPROVED, not yet in a settlement).
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import type { PrismaClient } from '@/generated/prisma';

export async function GET(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma, withBypassRls } = ctx;

  try {
    const fetchAssignments = (tx: PrismaClient) =>
      tx.loadDriverAssignment.findMany({
        where: {
          driverId: driver.id,
          tenantId: session.tenantId,
          payStatus: { in: ['PENDING_REVIEW', 'APPROVED'] },
          settlementId: null,
          deletedAt: null,
        },
        include: {
          payComponents: { where: { visibleToDriver: true, deletedAt: null } },
          load: { select: { id: true, referenceNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

    const assignments = isMobile
      ? await withBypassRls(fetchAssignments)
      : await fetchAssignments(await getPrisma());

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('GET /api/driver-pay/me/current-period error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
