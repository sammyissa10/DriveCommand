/**
 * GET /api/driver-pay/reports/deduction-balances
 *
 * Returns FIXED_INSTALLMENTS deductions with outstanding balance (point-in-time, not period-scoped).
 * Supports ?format=csv for streaming CSV download.
 * OWNER / MANAGER / SYSTEM_ADMIN only — DRIVER → 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import {
  computeDeductionBalances,
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
    const driverIds = sp.getAll('driverIds').filter(Boolean);
    const format = (sp.get('format') ?? 'json') as 'json' | 'csv';
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSize = format === 'csv'
      ? 100_000
      : Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

    // NOTE: No period parsing — deduction balances are point-in-time snapshots
    const prisma = await getTenantPrisma();
    const result = await computeDeductionBalances(
      prisma,
      session.tenantId,
      { page: format === 'csv' ? 1 : page, pageSize },
      driverIds.length ? driverIds : undefined,
    );

    if (format === 'csv') {
      const headers = [
        'Driver', 'Deduction Type', 'Total Amount', 'Collected',
        'Remaining', '% Complete', 'Schedule',
      ];
      const rows = result.rows.map((r) => [
        r.driverName,
        r.deductionType,
        r.totalAmount,
        r.amountCollected,
        r.remaining,
        r.percentComplete.toFixed(1),
        r.schedule,
      ]);
      const today = new Date().toISOString().slice(0, 10);
      return streamCsvResponse(headers, rows, `deduction-balances-${today}.csv`);
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('reports/deduction-balances error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
