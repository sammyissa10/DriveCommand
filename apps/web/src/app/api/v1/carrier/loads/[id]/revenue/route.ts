import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { recalculateAndStore } from '@/lib/carrier/revenue-calculator';

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
    const result = await recalculateAndStore(orgId, id);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      data: {
        id: result.id,
        totalRevenue: result.totalRevenue,
        fuelSurcharge: result.fuelSurcharge,
      },
    });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/loads/[id]/revenue failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
