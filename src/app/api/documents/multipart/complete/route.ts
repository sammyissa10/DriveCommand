/**
 * POST /api/documents/multipart/complete
 *
 * Complete multipart upload and save document record.
 * Enforces defense-in-depth s3Key validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { completeMultipartUpload, abortMultipartUpload } from '@/lib/storage/multipart';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { documentCreateSchema } from '@/lib/validations/document.schemas';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    // CRITICAL: Auth check FIRST before any data access
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    // Get tenant ID and current user
    const tenantId = await requireTenantId();
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const {
      s3Key,
      uploadId,
      parts,
      fileName,
      contentType,
      sizeBytes,
      entityType,
      entityId,
      documentType,
      expiryDate,
      notes,
    } = body;

    // Validate required fields
    if (!s3Key || !uploadId || !parts || !fileName || !contentType || !sizeBytes || !entityType || !entityId) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: s3Key, uploadId, parts, fileName, contentType, sizeBytes, entityType, entityId',
        },
        { status: 400 }
      );
    }

    // CRITICAL: Defense-in-depth - verify s3Key starts with tenant prefix AND drivers category
    if (!s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
      return NextResponse.json(
        { error: 'Invalid S3 key: does not match tenant or category' },
        { status: 403 }
      );
    }

    try {
      // Complete multipart upload in S3
      await completeMultipartUpload(s3Key, uploadId, parts);

      // Build document data
      const documentData: any = {
        fileName,
        s3Key,
        contentType,
        sizeBytes,
      };

      if (entityType === 'driver') {
        documentData.driverId = entityId;
        documentData.documentType = documentType;
        if (expiryDate) {
          documentData.expiryDate = expiryDate;
        }
        if (notes) {
          documentData.notes = notes;
        }
      } else {
        return NextResponse.json({ error: 'Invalid entity type for multipart upload' }, { status: 400 });
      }

      // Validate with Zod schema
      const result = documentCreateSchema.safeParse(documentData);

      if (!result.success) {
        // If validation fails, abort the multipart upload to clean up
        await abortMultipartUpload(s3Key, uploadId).catch(() => {
          // Log but don't fail if abort fails
          console.error('Failed to abort multipart upload after validation error');
        });

        return NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 });
      }

      // Create document record via repository
      const repo = new DocumentRepository(tenantId);
      const document = await repo.create({
        ...result.data,
        tenantId,
        uploadedBy: user.id,
      });

      // Revalidate driver page
      revalidatePath(`/drivers/${entityId}`);

      return NextResponse.json({ success: true, document });
    } catch (uploadError) {
      // If anything fails, attempt to abort the multipart upload
      await abortMultipartUpload(s3Key, uploadId).catch(() => {
        console.error('Failed to abort multipart upload after error');
      });

      throw uploadError;
    }
  } catch (error) {
    console.error('Multipart complete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete multipart upload' },
      { status: 500 }
    );
  }
}
