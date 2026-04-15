import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { uploadDocument, listDocuments } from '@/lib/carrier/documents';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const formData = await req.formData();
    const parentType = formData.get('parent_type')?.toString() ?? null;
    const parentId = formData.get('parent_id')?.toString() ?? null;
    const documentType = formData.get('document_type')?.toString() ?? null;
    const file = formData.get('file') as File | null;

    if (!parentType || !parentId || !documentType) {
      return NextResponse.json(
        { error: 'parent_type, parent_id, and document_type are required' },
        { status: 400 }
      );
    }

    const validParentTypes = ['stop', 'load', 'dispatch', 'contract', 'expense'] as const;
    if (!validParentTypes.includes(parentType as (typeof validParentTypes)[number])) {
      return NextResponse.json(
        { error: `parent_type must be one of: ${validParentTypes.join(', ')}` },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const result = await uploadDocument(orgId, session.userId, {
      parentType,
      parentId,
      documentType,
      file,
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/documents failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const parentType = searchParams.get('parent_type');
    const parentId = searchParams.get('parent_id');

    if (!parentType || !parentId) {
      return NextResponse.json(
        { error: 'parent_type and parent_id query params are required' },
        { status: 400 }
      );
    }

    const result = await listDocuments(orgId, parentType, parentId);
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('GET /api/v1/carrier/documents failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
