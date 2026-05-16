/**
 * GET /api/driver-pay/reports/accessorial-spend
 *
 * Returns accessorial spend grouped by client/contract with prior-period delta.
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
  type ReportFilters,
} from '@/lib/driver-pay/reporting';
import {
  computeAccessorialSpend,
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
    const driverIds = sp.getAll('driverIds').filter(Boolean);
    const format = (sp.get('format') ?? 'json') as 'json' | 'csv';

    const range = getPeriodRange(
      period,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined,
    );
    const filters: ReportFilters = { driverIds: driverIds.length ? driverIds : undefined };

    const prisma = await getTenantPrisma();
    const result = await computeAccessorialSpend(prisma, session.tenantId, range, filters);

    if (format === 'csv') {
      const headers = ['Client', 'Contract', 'Total Amount', 'Component Count', 'Avg Amount'];
      const rows = result.rows.map((r) => [
        r.clientName,
        r.contractName ?? '',
        r.totalAmount,
        String(r.componentCount),
        r.avgAmount,
      ]);
      const start = range.start.toISOString().slice(0, 10);
      const end = range.end.toISOString().slice(0, 10);
      return streamCsvResponse(headers, rows, `accessorial-spend-${start}-${end}.csv`);
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('reports/accessorial-spend error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
