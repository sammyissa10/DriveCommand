/**
 * GET  /api/v1/carrier/document-imports/[id]/optimisation
 * POST /api/v1/carrier/document-imports/[id]/optimisation   { action: 'apply' }
 *
 * Route optimisation (spec Section 9, Part B).
 *
 * GET is read-only and reorders nothing. It answers `offered: false` far more
 * often than not — below the floor, already the best order, or stops unchanged
 * since the applied template, which is Section 9's "runs on a trip only when
 * stops changed relative to the template".
 *
 * POST takes only `apply`, and even then recomputes the suggestion server-side
 * rather than applying an order the body carried. "Keep current order" is not a
 * request and has no endpoint: it is the absence of one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { staffViewer } from '@/lib/carrier/facility-visibility';
import { handleApplyOptimisation, handleGetOptimisation } from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetOptimisation(orgId, session.userId, id, staffViewer(session));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/optimisation failed', err);
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
    const result = await handleApplyOptimisation(
      orgId,
      session.userId,
      id,
      body,
      staffViewer(session),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/optimisation failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
