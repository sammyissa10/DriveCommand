/**
 * POST /api/v1/carrier/document-imports/[id]/stops/order   { order: number[] }
 *
 * Persist the running order (spec Section 10, "drag to reorder").
 *
 * Server-side, in `reviewed_extraction`, because a reorder that lives in
 * component state dies on navigation — which is exactly the check Phase 5's
 * verify table runs. The body is the whole permutation rather than a move
 * delta, so a retry is idempotent and a stale client cannot move the wrong stop.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleReorderStops } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleReorderStops(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/stops/order failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
