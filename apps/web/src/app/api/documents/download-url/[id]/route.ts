/**
 * GET /api/documents/download-url/[id]
 *
 * Generate a presigned download URL for a document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { generateDownloadUrl } from '@/lib/storage/presigned';
import { requireRestrictedDocumentAccess } from '@/lib/security/restricted-document-access';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { structuredLog } from '@/lib/security/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);
    const tenantId = await requireTenantId();

    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

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

    // Restricted document branch — RBAC + audit + 15-min presigned URL
    if (doc.isRestricted) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const result = await requireRestrictedDocumentAccess({
        documentId: doc.id,
        userId: session.userId,
        userRole: session.role as UserRole,
        tenantId,
        ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({
        downloadUrl: result.downloadUrl,
        fileName: result.fileName,
        isRestricted: true,
        expiresInSeconds: result.expiresInSeconds,
      });
    }

    // Non-restricted flow — tenant mismatch returns 404 to prevent tenant enumeration
    if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      const { id } = await params;
      structuredLog('warn', 'tenant_mismatch_404', {
        documentId: id,
        requestedBy: 'download-url',
      });
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const downloadUrl = await generateDownloadUrl(doc.s3Key);
    return NextResponse.json({ downloadUrl, fileName: doc.fileName });
  } catch (error) {
    logger.error('[download-url] error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
