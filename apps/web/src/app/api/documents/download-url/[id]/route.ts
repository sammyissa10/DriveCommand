/**
 * GET /api/documents/download-url/[id]
 *
 * Generate a presigned download URL for a document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { generateDownloadUrl } from '@/lib/storage/presigned';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
    const tenantId = await requireTenantId();
    const { id } = await params;

    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(id);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.s3Key) {
      return NextResponse.json(
        { error: 'This document has no file attached. Use the online link to view it.' },
        { status: 400 }
      );
    }

    if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return NextResponse.json({ error: 'Invalid document: does not match tenant' }, { status: 403 });
    }

    const downloadUrl = await generateDownloadUrl(doc.s3Key);
    return NextResponse.json({ downloadUrl, fileName: doc.fileName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
