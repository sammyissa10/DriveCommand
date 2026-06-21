import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/carrier/dashboard/kpi
 *
 * Returns KPI counts for the owner dashboard:
 * - loadsThisWeek: CarrierLoads created since Monday of this week
 * - pendingPayApprovals: DriverPayRecords with status = 'pending'
 * - openInvoices: Invoice records with status SENT or OVERDUE (outstanding AR per spec §5.8)
 * - revenueThisWeek: Sum of totalRevenue (or fallback to rate fields) for loads this week
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

    const tenantPrisma = await getTenantPrisma();
    const [loadsThisWeek, pendingPayApprovals, openInvoiceGroups, revenueRows] = await Promise.all([
      tenantPrisma.carrierLoad.count({
        where: {
          orgId,
          isSample: false,
          createdAt: { gte: monday },
        },
      }),
      tenantPrisma.driverPayRecord.count({
        where: {
          orgId,
          status: 'pending',
        },
      }),
      // Invoice/InvoiceItem are RLS-scoped via getTenantPrisma() GUC — no explicit orgId filter needed.
      // CarrierLoad/CarrierExpense/DriverPayRecord use explicit orgId filters (those models have an orgId column).
      // "open" = SENT + OVERDUE per spec §5.8 outstanding-AR semantics.
      tenantPrisma.invoice.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: true,
      }),
      // Fetch revenue fields for this week's non-cancelled loads (exclude sample data)
      tenantPrisma.carrierLoad.findMany({
        where: {
          orgId,
          isSample: false,
          createdAt: { gte: monday },
          status: { not: 'cancelled' },
        },
        select: {
          totalRevenue: true,
          rateAmount: true,
          fuelSurcharge: true,
          detentionAmount: true,
          otherCharges: true,
        },
      }),
    ]);

    const openInvoices = openInvoiceGroups
      .filter(g => g.status === 'SENT' || g.status === 'OVERDUE')
      .reduce((sum, g) => sum + g._count, 0);

    // Compute revenue: prefer totalRevenue, fall back to summing rate fields
    let revenueThisWeek = 0;
    for (const row of revenueRows) {
      if (row.totalRevenue !== null && Number(row.totalRevenue) > 0) {
        revenueThisWeek += Number(row.totalRevenue);
      } else {
        const fallback =
          Number(row.rateAmount ?? 0) +
          Number(row.fuelSurcharge ?? 0) +
          Number(row.detentionAmount ?? 0) +
          Number(row.otherCharges ?? 0);
        revenueThisWeek += fallback;
      }
    }

    return NextResponse.json({ loadsThisWeek, pendingPayApprovals, openInvoices, revenueThisWeek });
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/kpi] Failed to fetch KPIs:', err);
    return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 });
  }
}
