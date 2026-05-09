import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listDocumentTypes, createDocumentType } from '@/lib/carrier/document-types';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const activeOnly = req.nextUrl.searchParams.get('active_only') === 'true';
    const types = await listDocumentTypes(orgId, activeOnly);
    return NextResponse.json({ data: types });
  } catch (err) {
    logger.error('GET /api/v1/carrier/document-types failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const body = await req.json() as { name?: string };
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const result = await createDocumentType(orgId, body.name);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-types failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
