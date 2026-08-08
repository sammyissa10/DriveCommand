/**
 * GET  /api/v1/carrier/document-imports/[id]/template
 * POST /api/v1/carrier/document-imports/[id]/template   { action, templateId? }
 *
 * Route template matching (spec Section 8).
 *
 * GET is read-only: it runs the facility ladder, scores the candidate templates
 * over the RESOLVED facility ids, and returns whichever of Section 8's three
 * presentations the best score earns. It commits nothing — an auto-collapsed
 * template comes back with `persisted: false` until a mutation needs it.
 *
 * POST is `select`, `apply`, `decline` or `reset`. Selecting, declining and
 * resetting write one column and one provenance record; applying rewrites the
 * running order and is therefore always something a person asked for, never a
 * consequence of looking. `reset` is the "Look again" control (quick-516): it
 * clears the stored decision so the next read scores the templates again, which
 * is a write, which is why it is not the GET that control used to call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleGetTemplate, handleSetTemplate } from '@/lib/document-import/handlers';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await handleGetTemplate(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports/[id]/template failed', err);
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
    const result = await handleSetTemplate(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/template failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
