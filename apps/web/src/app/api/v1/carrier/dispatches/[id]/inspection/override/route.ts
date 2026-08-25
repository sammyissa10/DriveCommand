import { NextRequest, NextResponse } from 'next/server';
import { getSession, requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { logger, serializeError } from '@/lib/logger';
import { handleOverride } from '@/lib/carrier/inspection-handlers';

/**
 * POST /api/v1/carrier/dispatches/[id]/inspection/override
 *
 * Item 5: an owner override of the inspection gate, before or after a failure,
 * with a typed reason. Written to `DispatchOverrideAudit` (user + reason +
 * timestamp) AND onto the trip row, so it is permanently visible.
 *
 * OWNER or MANAGER only. Spec Section 15 says dispatcher-or-above; a DRIVER
 * overriding their own failed brake check would make the whole gate decorative.
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
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  } catch {
    return NextResponse.json(
      { error: 'Only an owner or manager can override an inspection.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    let body: { reason?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await handleOverride({
      orgId,
      dispatchId: id,
      userId: session.userId,
      reason: body?.reason,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches/[id]/inspection/override failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
