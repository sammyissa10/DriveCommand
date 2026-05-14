/**
 * GET /api/driver-pay/me/settlements/[id]
 *
 * Returns full breakdown for one of the authenticated driver's own settlements.
 * Includes assignments (with visible payComponents), bonuses, and deduction snapshot.
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import type { PrismaClient } from '@/generated/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma, withBypassRls } = ctx;

  const { id } = await params;

  try {
    const fetch = async (tx: PrismaClient) => {
      const settlement = await tx.driverSettlement.findFirst({
        where: {
          id,
          driverId: driver.id,
          tenantId: session.tenantId,
          deletedAt: null,
        },
        include: {
          assignments: {
            include: {
              payComponents: { where: { visibleToDriver: true, deletedAt: null } },
              load: { select: { id: true, referenceNumber: true, status: true } },
            },
          },
          bonuses: { where: { deletedAt: null, visibleToDriver: true } },
        },
      });

      if (!settlement) return { settlement: null, deductions: [] as object[] };

      // Load driver deductions (current snapshot)
      const deductions = await tx.driverDeduction.findMany({
        where: {
          driverId: driver.id,
          tenantId: session.tenantId,
          deletedAt: null,
          visibleToDriver: true,
        },
      });

      return { settlement, deductions };
    };

    const result = isMobile
      ? await withBypassRls(fetch)
      : await fetch(await getPrisma());

    if (!result.settlement) {
      return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/driver-pay/me/settlements/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
