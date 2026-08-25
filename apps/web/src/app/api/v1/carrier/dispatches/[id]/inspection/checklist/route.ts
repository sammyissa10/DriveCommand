import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { handleGetChecklist, handleOpenChecklist } from '@/lib/carrier/inspection-handlers';

/**
 * GET  /api/v1/carrier/dispatches/[id]/inspection/checklist?instanceId=...
 * POST /api/v1/carrier/dispatches/[id]/inspection/checklist
 *
 * GET reads an existing checklist. POST opens one, creating the PlaybookInstance
 * if the tenant has no ON_DISPATCH_CREATE trigger configured.
 *
 * Two verbs rather than one, because opening can WRITE. quick-516's lesson is
 * that anything which can change stored state is a POST — a GET that quietly
 * spawns a checklist would put the module's creation path on a page load.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const instanceId = req.nextUrl.searchParams.get('instanceId');
    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 });
    }

    const result = await handleGetChecklist({
      orgId,
      dispatchId: id,
      playbookInstanceId: instanceId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('GET /api/v1/carrier/dispatches/[id]/inspection/checklist failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const result = await handleOpenChecklist({
      orgId,
      dispatchId: id,
      userId: session.userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches/[id]/inspection/checklist failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
