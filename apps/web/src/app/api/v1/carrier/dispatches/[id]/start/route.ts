import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { transitionTripStatus } from '@/lib/carrier/trips';

/**
 * POST /api/v1/carrier/dispatches/[id]/start
 * Start a trip - transitions status from planned to in_progress and notifies the driver.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;

    const result = await transitionTripStatus(
      orgId,
      id,
      'in_progress',
      undefined
    );

    if (result === null) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, details: (result as { error: string; details?: { from: string; to: string } }).details },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches/[id]/start failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
