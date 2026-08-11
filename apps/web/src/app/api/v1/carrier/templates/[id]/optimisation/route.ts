/**
 * GET  /api/v1/carrier/templates/[id]/optimisation
 * POST /api/v1/carrier/templates/[id]/optimisation   { action: 'apply' }
 *
 * Route optimisation for a saved route template (spec Section 9, Part B:
 * *"runs on the template when created or edited — optimise once, reuse daily"*).
 *
 * A GET the template screen calls after a save, rather than something bolted
 * into the save path. Two reasons, both constraints of the phase: a save that
 * reached a routing provider would make writing a template depend on a network
 * call, and a save that reordered would be the mutation Part B forbids.
 *
 * POST applies the order and nothing else about the template — same facilities,
 * same windows, same paperwork — through `saveRouteTemplateCore`, the one place
 * a template gets written.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import {
  handleApplyTemplateOptimisation,
  handleGetTemplateOptimisation,
} from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetTemplateOptimisation(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/templates/[id]/optimisation failed', err);
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
    const result = await handleApplyTemplateOptimisation(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/templates/[id]/optimisation failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
