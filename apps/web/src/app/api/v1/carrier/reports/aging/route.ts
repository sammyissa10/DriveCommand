import { NextRequest, NextResponse } from 'next/server';
import { resolveReportAccess } from '@/lib/carrier/report-access';
import { logger } from '@/lib/logger';
import { getAgingReport } from '@/lib/carrier/reports';

export async function GET(_req: NextRequest) {
  // quick-554: 401 no session / 403 wrong role or missing permission / 403 no tenant.
  // Middleware gates the PAGE at /carrier/reports/...; it never sees this path.
  const access = await resolveReportAccess('arAgingReport');
  if (!access.ok) return access.response;
  const { orgId } = access;

  try {
    const result = await getAgingReport(orgId);
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('GET /api/v1/carrier/reports/aging failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
