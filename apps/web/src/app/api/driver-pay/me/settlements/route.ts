/**
 * GET /api/driver-pay/me/settlements
 *
 * Returns the authenticated driver's own settlements (excluding DRAFTs), paginated.
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import type { PrismaClient } from '@/generated/prisma';

export async function GET(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma, withBypassRls } = ctx;

  // Pagination
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const skip = (page - 1) * limit;

  try {
    const fetch = (tx: PrismaClient) =>
      Promise.all([
        tx.driverSettlement.findMany({
          where: {
            driverId: driver.id,
            tenantId: session.tenantId,
            status: { not: 'DRAFT' },
            deletedAt: null,
          },
          orderBy: { periodStart: 'desc' },
          skip,
          take: limit,
        }),
        tx.driverSettlement.count({
          where: {
            driverId: driver.id,
            tenantId: session.tenantId,
            status: { not: 'DRAFT' },
            deletedAt: null,
          },
        }),
      ]);

    const [settlements, total] = isMobile
      ? await withBypassRls(fetch)
      : await fetch(await getPrisma());

    return NextResponse.json({ settlements, total, page, limit });
  } catch (error) {
    console.error('GET /api/driver-pay/me/settlements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
