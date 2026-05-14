/**
 * GET /api/driver-pay/reports/overview
 *
 * Returns KPI summary + net pay trend + deduction breakdown for the selected period.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import {
  getPeriodRange,
  getPriorPeriodRange,
  computeOverviewKpis,
  computeNetPayTrend,
  computeDeductionBreakdown,
  type PeriodKey,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['OWNER', 'MANAGER', 'SYSTEM_ADMIN']);
const VALID_PERIODS: PeriodKey[] = ['this_week', 'last_week', 'this_month', 'last_month', 'custom'];

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
        return NextResponse.json({ error: 'customStart and customEnd are required for period=custom' }, { status: 400 });
      }
      customStart = new Date(customStartStr);
      customEnd = new Date(customEndStr);
      if (isNaN(customStart.getTime()) || isNaN(customEnd.getTime())) {
        return NextResponse.json({ error: 'Invalid customStart or customEnd date' }, { status: 400 });
      }
    }

    const driverIdsParam = sp.get('driverIds');
    const driverIds = driverIdsParam ? driverIdsParam.split(',').filter(Boolean) : undefined;

    const employmentTypeParam = sp.get('employmentType') ?? 'ALL';
    if (!['EMPLOYEE', 'CONTRACTOR', 'ALL'].includes(employmentTypeParam)) {
      return NextResponse.json({ error: 'Invalid employmentType' }, { status: 400 });
    }
    const employmentType = employmentTypeParam as ReportFilters['employmentType'];

    const statusParam = sp.get('status') ?? 'ALL';

    const filters: ReportFilters = { driverIds, employmentType, status: statusParam };

    // 3. Compute ranges
    const range = getPeriodRange(periodParam, customStart, customEnd);
    const priorRange = getPriorPeriodRange(range);

    // 4. Query
    const prisma = await getTenantPrisma();

    const [kpis, netPayTrend, deductionBreakdown] = await Promise.all([
      computeOverviewKpis(prisma, session.tenantId, range, filters),
      computeNetPayTrend(prisma, session.tenantId, range, filters),
      computeDeductionBreakdown(prisma, session.tenantId, range, filters),
    ]);

    return NextResponse.json({
      period: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      priorPeriod: {
        start: priorRange.start.toISOString(),
        end: priorRange.end.toISOString(),
      },
      kpis,
      netPayTrend,
      deductionBreakdown,
    });
  } catch (err) {
    logger.error('reports/overview route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
