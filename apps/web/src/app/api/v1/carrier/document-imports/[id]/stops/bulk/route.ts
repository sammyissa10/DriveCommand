/**
 * POST /api/v1/carrier/document-imports/[id]/stops/bulk
 *      { stopIndexes: number[], notes?, requiredDocuments?, appointment?,
 *        stopType?, copyQuantitiesFromAbove?, clear? }
 *
 * The bulk apply bar (spec Section 10).
 *
 * `stopIndexes` IS the selection the user made. The server never intersects it
 * with what was rendered, so a selected stop scrolled out of view is written
 * exactly like one on screen — Phase 5's stated drift risk is answered by the
 * shape of this request rather than by a component being careful.
 *
 * The response carries `applied` and `skipped` so the confirmation the user
 * already saw ("Apply to 7 stops?") can be checked against what actually
 * happened, rather than being assumed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleBulkApplyStops } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleBulkApplyStops(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/stops/bulk failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
