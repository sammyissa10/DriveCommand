import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getContractLoadsSummary } from '@/lib/carrier/contracts';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const summary = await getContractLoadsSummary(orgId, id);
    if (!summary) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: summary });
  } catch (err) {
    logger.error('GET /api/v1/carrier/contracts/[id]/loads failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
