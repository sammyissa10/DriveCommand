import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getComplianceAlerts } from '@/lib/carrier/compliance';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const alerts = await getComplianceAlerts(orgId);
    return NextResponse.json({ data: alerts });
  } catch (err) {
    logger.error('GET /api/v1/carrier/compliance-alerts failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
