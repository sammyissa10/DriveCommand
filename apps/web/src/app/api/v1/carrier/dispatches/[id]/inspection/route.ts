import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { handleGetGate } from '@/lib/carrier/inspection-handlers';

/**
 * GET /api/v1/carrier/dispatches/[id]/inspection
 *
 * The inspection gate's state for a trip: can it start, why not, what failed,
 * and whether an override is already in place. Pure read — the owner portal's
 * trip detail renders from this and must never mutate by being looked at.
 */
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
    const result = await handleGetGate({ orgId, dispatchId: id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('GET /api/v1/carrier/dispatches/[id]/inspection failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
