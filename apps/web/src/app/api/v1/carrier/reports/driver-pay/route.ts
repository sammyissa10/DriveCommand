import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getDriverPayReport } from '@/lib/carrier/reports';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

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
