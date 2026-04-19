import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/carrier/dashboard/kpi
 *
 * Returns KPI counts for the owner dashboard:
 * - loadsThisWeek: CarrierLoads created since Monday of this week
 * - pendingPayApprovals: DriverPayRecords with status = 'pending'
 * - openInvoices: CarrierLoads with status = 'invoiced'
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    // Monday of this week at 00:00:00 UTC
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, …
    const daysToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const [loadsThisWeek, pendingPayApprovals, openInvoices] = await Promise.all([
      prisma.carrierLoad.count({
        where: {
          orgId,
          createdAt: { gte: monday },
        },
      }),
      prisma.driverPayRecord.count({
        where: {
          orgId,
          status: 'pending',
        },
      }),
      prisma.carrierLoad.count({
        where: {
          orgId,
          status: 'invoiced',
        },
      }),
    ]);

    return NextResponse.json({ loadsThisWeek, pendingPayApprovals, openInvoices });
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/kpi] Failed to fetch KPIs:', err);
    return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 });
  }
}
