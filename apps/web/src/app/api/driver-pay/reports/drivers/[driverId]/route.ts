/**
 * GET /api/driver-pay/reports/drivers/[driverId]
 *
 * Returns per-driver YTD earnings, settlements, bonuses, and deduction balances.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { computeDriverDetail } from '@/lib/driver-pay/reporting';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['OWNER', 'MANAGER', 'SYSTEM_ADMIN']);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ driverId: string }> },
) {
  try {
    // 1. Auth
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED.has(session.role.toUpperCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Params
    const { driverId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const yearStr = sp.get('year');
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    const prisma = await getTenantPrisma();

    // 3. Verify driver belongs to this tenant (RLS also enforces this, but explicit check → 404)
    const driverCheck = await prisma.carrierDriver.findFirst({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driverCheck) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // 4. Compute
    const detail = await computeDriverDetail(prisma, session.tenantId, driverId, year);
    if (!detail) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    logger.error('reports/drivers/[driverId] route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
