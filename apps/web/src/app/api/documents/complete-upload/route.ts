/**
 * POST /api/documents/complete-upload
 *
 * Save document metadata to the database after a successful S3 upload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { documentCreateSchema } from '@drivecommand/validation';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    const tenantId = await requireTenantId();

    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const data = await req.json();

    if (data.s3Key && !data.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return NextResponse.json({ error: 'Invalid S3 key: does not match tenant' }, { status: 403 });
    }

    const documentData: any = {
      fileName: data.documentName || data.fileName,
      s3Key: data.s3Key || '',
      contentType: data.contentType || '',
      sizeBytes: data.sizeBytes || 0,
    };

    if (data.entityType === 'truck') {
      documentData.truckId = data.entityId;
    } else {
      documentData.routeId = data.entityId;
    }

    if (data.description) documentData.description = data.description;
    if (data.externalUrl) documentData.externalUrl = data.externalUrl;
    if (data.expiryDate) documentData.expiryDate = new Date(data.expiryDate);

    const result = documentCreateSchema.safeParse(documentData);

    if (!result.success) {
      const messages = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json({ error: messages || 'Invalid document data' }, { status: 400 });
    }

    const repo = new DocumentRepository(tenantId);
    await repo.create({
      ...result.data,
      tenantId,
      uploadedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[complete-upload] CAUGHT ERROR:', error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
