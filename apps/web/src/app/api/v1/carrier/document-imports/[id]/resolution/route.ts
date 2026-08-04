/**
 * GET   /api/v1/carrier/document-imports/[id]/resolution      — the card's state
 * PATCH /api/v1/carrier/document-imports/[id]/resolution      — select client or contract
 *
 * GET takes `?q=` and is only needed by the client picker as the user types —
 * `GET /[id]` already embeds the same view. Both are ten-line adapters over
 * `handlers.ts`, which the mobile routes call too.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleGetResolution, handleSetResolution } from '@/lib/document-import/handlers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const q = req.nextUrl.searchParams.get('q');
    const result = await handleGetResolution(orgId, session.userId, id, q);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/resolution failed', err);
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
    const result = await handleSetResolution(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/document-imports/[id]/resolution failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
