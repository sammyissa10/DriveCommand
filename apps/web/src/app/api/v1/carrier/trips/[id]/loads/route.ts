import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { addLoadToTrip } from '@/lib/carrier/trips';

const AddLoadSchema = z.object({
  loadId: z.string().uuid(),
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

  const parseResult = AddLoadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { loadId } = parseResult.data;

  try {
    const result = await addLoadToTrip(session.tenantId, tripId, loadId);

    if ('error' in result) {
      logger.warn('addLoadToTrip failed', { tripId, loadId, error: result.error });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info('addLoadToTrip success', { tripId, loadId });
    return NextResponse.json({ data: result.trip });
  } catch (err) {
    logger.error('addLoadToTrip exception', { tripId, loadId, err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
