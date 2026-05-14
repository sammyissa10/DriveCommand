/**
 * GET /api/driver-pay/me/bonuses
 *
 * Returns the authenticated driver's own bonuses (visibleToDriver=true).
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
    const fetchBonuses = (tx: PrismaClient) =>
      tx.driverBonus.findMany({
        where: {
          driverId: driver.id,
          tenantId: session.tenantId,
          visibleToDriver: true,
          deletedAt: null,
        },
        orderBy: { triggerDate: 'desc' },
      });

    const bonuses = isMobile
      ? await withBypassRls(fetchBonuses)
      : await fetchBonuses(await getPrisma());

    return NextResponse.json({ bonuses });
  } catch (error) {
    console.error('GET /api/driver-pay/me/bonuses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
