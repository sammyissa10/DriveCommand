import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { removeLoadFromTrip } from '@/lib/carrier/loads';

const CancelSchema = z.object({
  removeStops: z.boolean().optional().default(true),
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: loadId } = await params;
  const orgId = session.tenantId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parseResult = CancelSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { removeStops, reason } = parseResult.data;

  try {
    const tenantPrisma = await getTenantPrisma();
    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: loadId, orgId },
    });

    if (!load) {
      return NextResponse.json({ error: 'Load not found' }, { status: 404 });
    }

    if (load.status === 'cancelled') {
      return NextResponse.json({ error: 'Load is already cancelled' }, { status: 400 });
    }

    // If load has a dispatch and user wants to remove stops
    let removedStopCount = 0;
    if (load.dispatchId && removeStops) {
      const result = await removeLoadFromTrip(orgId, loadId, true);
      if ('error' in result) {
        return NextResponse.json(result, { status: 400 });
      }
      removedStopCount = result.removedStopCount;
    }

    // Update load status to cancelled
    const notes = load.notes
      ? `${load.notes}\n[CANCELLED] ${reason || 'No reason provided'}`
      : `[CANCELLED] ${reason || 'No reason provided'}`;

    await tenantPrisma.carrierLoad.update({
      where: { id: loadId },
      data: { status: 'cancelled', notes },
    });

    logger.info('cancelLoad: load cancelled', {
      orgId,
      loadId,
      removedStopCount,
      reason: reason || 'No reason provided',
    });

    return NextResponse.json({ success: true, removedStopCount });
  } catch (err) {
    logger.error('cancelLoad exception', { loadId, err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
