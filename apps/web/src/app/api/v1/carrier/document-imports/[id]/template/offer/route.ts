/**
 * GET  /api/v1/carrier/document-imports/[id]/template/offer
 * POST /api/v1/carrier/document-imports/[id]/template/offer  { action }
 *
 * The post-commit template question (spec Section 8, items 5 and 7):
 * "the trip differed — update the template?" when one was applied, and the
 * one-tap "Save as route template" when the tenant setting is off.
 *
 * Both are no-ops until the import is COMMITTED, which Phase 8 owns. The offer
 * is RECORDED rather than derived, because "offered once, never silent" is a
 * claim about history that the current row cannot answer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import {
  handleGetTemplateOffer,
  handleTemplateOfferResponse,
} from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetTemplateOffer(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/template/offer failed', err);
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
    const result = await handleTemplateOfferResponse(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/template/offer failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
