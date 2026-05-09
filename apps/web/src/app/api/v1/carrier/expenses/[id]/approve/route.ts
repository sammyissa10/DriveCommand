import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { approveExpense } from '@/lib/carrier/expenses';

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
    const result = await approveExpense(orgId, id, session.userId);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/expenses/[id]/approve failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
