/**
 * DELETE /api/documents/delete/[id]
 *
 * Delete a document (S3 object + database record).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { deleteS3Object } from '@/lib/storage/presigned';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);
    const tenantId = await requireTenantId();

    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    const { id } = await params;

    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(id);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.s3Key && !doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return NextResponse.json({ error: 'Invalid document: does not match tenant' }, { status: 403 });
    }

    if (doc.s3Key) {
      await deleteS3Object(doc.s3Key);
    }

    await repo.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[delete] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
