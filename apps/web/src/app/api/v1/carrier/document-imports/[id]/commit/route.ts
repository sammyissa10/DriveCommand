/**
 * GET  /api/v1/carrier/document-imports/[id]/commit   — the assignment screen
 * POST /api/v1/carrier/document-imports/[id]/commit   — commit the trip
 *
 * Spec Section 11.
 *
 * GET is read-only and runs the same validation the POST does, so the disabled
 * button and the server's refusal always agree.
 *
 * POST is the control. Validation is enforced in `commitImport`, not here and
 * not in the UI — a request naming a driver with an expired licence is refused
 * with the reason named, whatever client sent it.
 *
 * The viewer is built from the session because the driver-residence rule is a
 * server-side filter (spec Section 9): the end stop of a DRIVER_RESIDENCE trip
 * is a facility not everyone may see.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { staffViewer } from '@/lib/carrier/facility-visibility';
import { handleCommitImport, handleGetCommitPreview } from '@/lib/document-import/handlers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    const result = await handleGetCommitPreview(
      orgId,
      session.userId,
      id,
      query,
      staffViewer(session),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/commit failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleCommitImport(orgId, session.userId, id, body, staffViewer(session));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/commit failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
