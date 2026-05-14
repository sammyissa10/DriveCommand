/**
 * GET /api/driver-pay/reports/settlements
 *
 * Paginated, sortable settlement list with anomaly flag.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import {
  getPeriodRange,
  computeRollingAvgNetPay,
  isNetPayAnomaly,
  type PeriodKey,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';
import { countedSettlementsWhere } from '@/lib/driver-pay/reporting-predicate';
import Decimal from 'decimal.js';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['OWNER', 'MANAGER', 'SYSTEM_ADMIN']);
const VALID_PERIODS: PeriodKey[] = ['this_week', 'last_week', 'this_month', 'last_month', 'custom'];
const VALID_SORT_BY = ['periodEnd', 'netPay', 'driverName', 'status'] as const;
type SortBy = (typeof VALID_SORT_BY)[number];

function buildOrderBy(sortBy: SortBy, sortDir: 'asc' | 'desc'): Prisma.DriverSettlementOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'periodEnd':
      return [{ periodEnd: sortDir }];
    case 'netPay':
      return [{ netPay: sortDir }];
    case 'status':
      return [{ status: sortDir }];
    case 'driverName':
      return [{ driver: { firstName: sortDir } }, { driver: { lastName: sortDir } }];
    default:
      return [{ periodEnd: 'desc' }];
  }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Auth
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED.has(session.role.toUpperCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Parse params
    const sp = req.nextUrl.searchParams;
    const periodParam = (sp.get('period') ?? 'this_week') as PeriodKey;
    if (!VALID_PERIODS.includes(periodParam)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }

    const customStartStr = sp.get('customStart');
    const customEndStr = sp.get('customEnd');
    let customStart: Date | undefined;
    let customEnd: Date | undefined;

    if (periodParam === 'custom') {
      if (!customStartStr || !customEndStr) {
        return NextResponse.json({ error: 'customStart and customEnd required for period=custom' }, { status: 400 });
      }
      customStart = new Date(customStartStr);
      customEnd = new Date(customEndStr);
      if (isNaN(customStart.getTime()) || isNaN(customEnd.getTime())) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      }
    }

    const driverIdsParam = sp.get('driverIds');
    const driverIds = driverIdsParam ? driverIdsParam.split(',').filter(Boolean) : undefined;
    const statusParam = sp.get('status') ?? 'ALL';
    const filters: ReportFilters = { driverIds, status: statusParam };

    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSizeRaw = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));
    const sortByRaw = (sp.get('sortBy') ?? 'periodEnd') as SortBy;
    const sortBy = VALID_SORT_BY.includes(sortByRaw) ? sortByRaw : 'periodEnd';
    const sortDirRaw = sp.get('sortDir') ?? 'desc';
    const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';

    // 3. Period range
    const range = getPeriodRange(periodParam, customStart, customEnd);

    // 4. Build where clause using canonical predicate (payroll_out scope: PAID only,
    //    period overlap semantics, soft-delete excluded). This fixes the mismatch
    //    between the Settlements table and the KPI cards on the Reports page.
    const where = countedSettlementsWhere(session.tenantId, range, filters, 'payroll_out');

    const skip = (page - 1) * pageSizeRaw;
    const prisma = await getTenantPrisma();

    const [rows, total] = await Promise.all([
      prisma.driverSettlement.findMany({
        where,
        include: {
          driver: {
            select: { firstName: true, lastName: true, payModel: true },
          },
        },
        orderBy: buildOrderBy(sortBy, sortDir),
        skip,
        take: pageSizeRaw,
      }),
      prisma.driverSettlement.count({ where }),
    ]);

    // 5. Compute anomaly flag per row
    const rowsWithAnomaly = await Promise.all(
      rows.map(async (s) => {
        const rollingAvg = await computeRollingAvgNetPay(
          prisma,
          session.tenantId,
          s.driverId,
          s.periodEnd,
        );
        const netPayDecimal = new Decimal(s.netPay.toString());
        const anomaly = isNetPayAnomaly(netPayDecimal, rollingAvg);
        return {
          id: s.id,
          driverId: s.driverId,
          driverName: s.driver ? `${s.driver.firstName} ${s.driver.lastName}` : null,
          periodStart: s.periodStart.toISOString(),
          periodEnd: s.periodEnd.toISOString(),
          grossTaxable: s.grossTaxable.toString(),
          grossNonTaxable: s.grossNonTaxable.toString(),
          totalDeductions: s.totalDeductions.toString(),
          netPay: netPayDecimal.toFixed(2),
          status: s.status,
          paidAt: s.paidAt?.toISOString() ?? null,
          isAnomaly: anomaly,
        };
      }),
    );

    const totalPages = Math.ceil(total / pageSizeRaw);

    return NextResponse.json({
      rows: rowsWithAnomaly,
      total,
      page,
      pageSize: pageSizeRaw,
      totalPages,
    });
  } catch (err) {
    logger.error('reports/settlements route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
