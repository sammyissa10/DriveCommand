/**
 * GET /api/driver-pay/reports/overtime-exposure
 *
 * Returns OVERTIME pay components with driver/load context, paginated.
 * Supports ?format=csv for streaming CSV download.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import {
  getPeriodRange,
  type PeriodKey,
} from '@/lib/driver-pay/reporting';
import {
  computeOvertimeExposure,
  streamCsvResponse,
} from '@/lib/driver-pay/reports';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['OWNER', 'MANAGER', 'SYSTEM_ADMIN'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role.toUpperCase() as AllowedRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const period = (sp.get('period') ?? 'this_month') as PeriodKey;
    const customStart = sp.get('customStart');
    const customEnd = sp.get('customEnd');
    const format = (sp.get('format') ?? 'json') as 'json' | 'csv';
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSize = format === 'csv'
      ? 100_000
      : Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

    const range = getPeriodRange(
      period,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined,
    );

    const prisma = await getTenantPrisma();
    const result = await computeOvertimeExposure(prisma, session.tenantId, range, {
      page: format === 'csv' ? 1 : page,
      pageSize,
    });

    if (format === 'csv') {
      const headers = ['Driver', 'Load Ref', 'Overtime Amount', 'Actual Hours', 'Assignment ID'];
      const rows = result.rows.map((r) => [
        r.driverName,
        r.referenceNumber ?? '',
        r.overtimeAmount,
        r.actualHours ?? '',
        r.assignmentId,
      ]);
      const start = range.start.toISOString().slice(0, 10);
      const end = range.end.toISOString().slice(0, 10);
      return streamCsvResponse(headers, rows, `overtime-exposure-${start}-${end}.csv`);
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('reports/overtime-exposure error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
