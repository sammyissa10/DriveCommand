/**
 * POST /api/v1/carrier/document-imports/[id]/resolution/contract
 *
 * Create a contract for this import's client and select it. `{ spot: true }` —
 * the default — is the one-time rate-confirmation contract: flat rate from the
 * document, effective for that day only, source document attached.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleCreateResolutionContract } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleCreateResolutionContract(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/resolution/contract failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
