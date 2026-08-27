import { NextRequest, NextResponse } from 'next/server';
import { resolveReportAccess } from '@/lib/carrier/report-access';
import { logger } from '@/lib/logger';
import { getDriverPayReport } from '@/lib/carrier/reports';

export async function GET(req: NextRequest) {
  // quick-554: 401 no session / 403 wrong role or missing permission / 403 no tenant.
  // Middleware gates the PAGE at /carrier/reports/...; it never sees this path.
  const access = await resolveReportAccess('driverPayReport');
  if (!access.ok) return access.response;
  const { orgId } = access;

  try {
    const { searchParams } = req.nextUrl;
    const driverId = searchParams.get('driver_id') ?? undefined;
    const payPeriodStart = searchParams.get('pay_period_start') ?? undefined;
    const payPeriodEnd = searchParams.get('pay_period_end') ?? undefined;
    const status = searchParams.get('status') ?? undefined;

    const result = await getDriverPayReport(orgId, { driverId, payPeriodStart, payPeriodEnd, status });
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('GET /api/v1/carrier/reports/driver-pay failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
