import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { recalculatePayRecordReimbursements } from '@/lib/carrier/pay-calculator';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;

    const result = await recalculatePayRecordReimbursements(orgId, id);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/pay-records/[id]/recalculate failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
