import { NextRequest, NextResponse } from 'next/server';
import { resolveReportAccess } from '@/lib/carrier/report-access';
import { logger } from '@/lib/logger';
import { getPerformanceReport } from '@/lib/carrier/reports';

export async function GET(req: NextRequest) {
  // quick-554: 401 no session / 403 wrong role or missing permission / 403 no tenant.
  // Middleware gates the PAGE at /carrier/reports/...; it never sees this path.
  const access = await resolveReportAccess('performanceReport');
  if (!access.ok) return access.response;
  const { orgId } = access;

  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const driverId = searchParams.get('driver_id') ?? undefined;

    const result = await getPerformanceReport(orgId, { dateFrom, dateTo, driverId });
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('GET /api/v1/carrier/reports/performance failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
