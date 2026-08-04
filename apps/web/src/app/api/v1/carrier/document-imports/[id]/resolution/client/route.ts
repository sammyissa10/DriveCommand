/**
 * POST /api/v1/carrier/document-imports/[id]/resolution/client
 *
 * Create a client from the pre-filled extraction details and select it, in one
 * request. One request rather than two (create, then select) is what makes
 * "wizard state survives creating a client mid-flow" structural: there is no
 * window in which a client exists and the import does not know about it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleCreateResolutionClient } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleCreateResolutionClient(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/resolution/client failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
