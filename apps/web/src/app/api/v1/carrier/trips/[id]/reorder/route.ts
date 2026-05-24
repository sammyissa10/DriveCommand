import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { reorderTripStops } from '@/lib/carrier/trips';

const ReorderSchema = z.object({
  stopOrder: z.array(z.string().uuid()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tripId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parseResult = ReorderSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { stopOrder } = parseResult.data;

  try {
    const result = await reorderTripStops(session.tenantId, tripId, stopOrder);

    if ('error' in result) {
      logger.warn('reorderTripStops failed', { tripId, error: result.error });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info('reorderTripStops success', { tripId, stopCount: stopOrder.length });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('reorderTripStops exception', { tripId, err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
