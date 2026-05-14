/**
 * GET /api/driver-pay/reports/operational-metrics
 *
 * Returns carrier-wide operational metrics: velocity, disputes, garnishment cap hit rate,
 * and carryover queue size.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import {
  getPeriodRange,
  computeOperationalMetrics,
  type PeriodKey,
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

    // 2. Parse period params
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

    // 3. Compute
    const range = getPeriodRange(periodParam, customStart, customEnd);
    const prisma = await getTenantPrisma();
    const metrics = await computeOperationalMetrics(prisma, session.tenantId, range);

    return NextResponse.json(metrics);
  } catch (err) {
    logger.error('reports/operational-metrics route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
