/**
 * GET  /api/v1/carrier/document-imports/[id]/end-stop
 * POST /api/v1/carrier/document-imports/[id]/end-stop   { action, policy?, facilityId? }
 *
 * End stop policy (spec Section 9, Part A).
 *
 * GET is read-only: it resolves the tenant default, the template override and
 * the per-trip choice in that order and describes the answer. It commits
 * nothing — a policy shown from the tenant default comes back with
 * `persisted: false` until a mutation needs it (quick-508's rule).
 *
 * POST is `select` or `reset`. `reset` DELETES the stored decision rather than
 * writing one that means "undecided": the view short-circuits on the key's
 * presence, so a control wired to a re-fetch would re-read the state it was
 * trying to leave (quick-516, one slot over).
 *
 * The viewer is built from the session because the driver-residence rule is
 * enforced in the query layer, never in the component (spec Section 9).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { staffViewer } from '@/lib/carrier/facility-visibility';
import { handleGetEndStop, handleSetEndStop } from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetEndStop(orgId, session.userId, id, staffViewer(session));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/end-stop failed', err);
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
    const result = await handleSetEndStop(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/end-stop failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
