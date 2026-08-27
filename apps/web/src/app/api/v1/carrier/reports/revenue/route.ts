import { NextRequest, NextResponse } from 'next/server';
import { resolveReportAccess } from '@/lib/carrier/report-access';
import { logger } from '@/lib/logger';
import { getRevenueReport } from '@/lib/carrier/reports';

export async function GET(req: NextRequest) {
  // quick-554: 401 no session / 403 wrong role or missing permission / 403 no tenant.
  // Middleware gates the PAGE at /carrier/reports/...; it never sees this path.
  const access = await resolveReportAccess('revenueReport');
  if (!access.ok) return access.response;
  const { orgId } = access;

  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const clientId = searchParams.get('client_id') ?? undefined;

    const result = await getRevenueReport(orgId, { dateFrom, dateTo, clientId });
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('GET /api/v1/carrier/reports/revenue failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
