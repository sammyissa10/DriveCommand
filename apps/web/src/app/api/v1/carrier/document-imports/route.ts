/**
 * GET  /api/v1/carrier/document-imports?scope=resumable|recent
 * POST /api/v1/carrier/document-imports
 *
 * GET backs the Trips-page resume banner (`resumable`) and the "Choose recent"
 * source option (`recent`). POST creates the import from the ordered storage
 * keys and is where duplicate detection happens (409 with both actions).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleCreateImport, handleListImports } from '@/lib/document-import/handlers';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const scope = req.nextUrl.searchParams.get('scope');
    const { status, body } = await handleListImports(orgId, session.userId, scope);
    return NextResponse.json(body, { status });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-imports failed', err, { userId: session.userId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const body = await req.json();
    const result = await handleCreateImport(orgId, session.userId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports failed', err, { userId: session.userId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
