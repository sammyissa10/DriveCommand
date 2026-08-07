/**
 * GET   /api/v1/carrier/document-imports/[id]/stops/review
 * PATCH /api/v1/carrier/document-imports/[id]/stops/review   { stopIndex, ...fields }
 *
 * The stop review screen (spec Section 10).
 *
 * GET is read-only: it composes the Phase 4 ladder view with the consignments in
 * `reviewed_extraction`, computes the rollups and the blocks, and returns. It
 * does not commit the silent links it displays — `persisted` on each row says
 * which are written and which are only derived.
 *
 * PATCH is one dispatcher's edit to one stop. Reorder and bulk apply are
 * separate routes on purpose: three different consequences, three different
 * things to have to press.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleGetStopReview, handleUpdateStop } from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetStopReview(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/stops/review failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleUpdateStop(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/document-imports/[id]/stops/review failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
