/**
 * GET  /api/v1/carrier/document-imports/[id]/stops
 * POST /api/v1/carrier/document-imports/[id]/stops   { stopIndex, facilityId }
 *
 * The facility resolution ladder (spec Section 7).
 *
 * GET is read-only — `getStopResolution` loads, decides and describes, and
 * nothing in its call graph writes. POST is the T3 exit: a person tapped a
 * proposed facility, so the link is made, the score they were shown is
 * recorded, and the external reference that makes tomorrow silent is written.
 *
 * Creating a facility is a different route (`stops/facility`) on purpose. Two
 * different verbs for two different consequences, so nothing can create by
 * accident.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import {
  handleConfirmStopFacility,
  handleGetStopResolution,
} from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetStopResolution(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/stops failed', err);
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
    const result = await handleConfirmStopFacility(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/stops failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
