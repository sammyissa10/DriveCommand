import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { handleStartTrip } from '@/lib/carrier/inspection-handlers';

/**
 * POST /api/v1/carrier/dispatches/[id]/start
 *
 * Start a trip — now THROUGH the Phase 9 inspection gate (spec Section 12).
 *
 * Before Phase 9 this delegated straight to `transitionTripStatus`, which
 * enforces the status state machine and nothing else: a trip could start on a
 * failed walkaround. `handleStartTrip` runs the gate first and only reaches
 * `transitionTripStatus` on an ALLOWED verdict, so the state machine is
 * unchanged and the compliance check sits in front of it.
 *
 * A blocked start returns 422 with `code` set to the gate outcome, so the caller
 * can route to the blocked screen rather than showing a generic failure.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;

    const result = await handleStartTrip({
      orgId,
      dispatchId: id,
      userId: session.userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches/[id]/start failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
