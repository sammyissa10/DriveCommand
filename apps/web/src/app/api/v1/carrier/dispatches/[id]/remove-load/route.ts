import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';

const RemoveLoadSchema = z.object({
  loadId: z.string().uuid(),
});

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
    const body = await req.json();
    const parsed = RemoveLoadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { loadId } = parsed.data;

    // Verify dispatch exists and belongs to this org
    const dispatch = await prisma.carrierDispatch.findFirst({
      where: { id, orgId },
      select: { id: true, status: true },
    });
    if (!dispatch) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });

    // Only planned dispatches allow load removal
    if (dispatch.status !== 'planned') {
      return NextResponse.json(
        { error: 'Can only modify loads on planned dispatches' },
        { status: 400 }
      );
    }

    // Verify load exists, belongs to this dispatch, and belongs to this org
    const load = await prisma.carrierLoad.findFirst({
      where: { id: loadId, dispatchId: id, orgId },
      select: { id: true },
    });
    if (!load) {
      return NextResponse.json(
        { error: 'Load not found on this dispatch' },
        { status: 404 }
      );
    }

    // Guard: check if any stops linked to this load have arrived or completed status
    const activeStop = await prisma.carrierStop.findFirst({
      where: {
        dispatchId: id,
        loadId,
        status: { in: ['arrived', 'completed'] },
      },
      select: { id: true },
    });
    if (activeStop) {
      return NextResponse.json(
        { error: 'Cannot remove a load with active stops' },
        { status: 400 }
      );
    }

    // Detach: clear dispatchId and reset status to pending
    await prisma.carrierLoad.update({
      where: { id: loadId },
      data: { dispatchId: null, status: 'pending' },
    });

    logger.info('remove-load: detached load from dispatch', { orgId, dispatchId: id, loadId });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches/[id]/remove-load failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
