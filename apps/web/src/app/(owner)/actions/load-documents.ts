'use server';

/**
 * Server actions for load document operations.
 * Handles rate confirmation uploads stored server-side directly to R2.
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { validateFileType, MAX_FILE_SIZE } from '@/lib/storage/validate';
import { deleteS3Object } from '@/lib/storage/presigned';
import { documentCreateSchema } from '@/lib/validations/document.schemas';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';

/**
 * Upload a rate confirmation document for a load, stored server-side directly to R2.
 * Requires OWNER or MANAGER role.
 */
export async function uploadLoadDocument(formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Extract form data
    const file = formData.get('file') as File;
    const loadId = formData.get('loadId') as string;
    const notes = formData.get('notes') as string | null;

    if (!file || !loadId) {
      return {
        error: 'Missing required fields: file and loadId are required',
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      };
    }

    // Read first 4100 bytes for magic bytes validation
    const buffer = await file.slice(0, 4100).arrayBuffer();

    // Validate file type using magic bytes (prevents MIME spoofing)
    const validation = await validateFileType(buffer, file.type);
    if (!validation.valid) {
      return {
        error: validation.error,
      };
    }

    // Get tenant ID
    const tenantId = await requireTenantId();

    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'User not found' };
    }

    // Generate unique file ID
    const fileId = nanoid();

    // Sanitize filename (remove path separators)
    const sanitizedFileName = file.name.replace(/[/\\]/g, '-');

    // Build S3 key with loads category for tenant isolation
    const s3Key = `tenant-${tenantId}/loads/${fileId}-${sanitizedFileName}`;

    // Upload directly to R2 server-side (no presigned URL, no CORS)
    await s3Client.send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: validation.detectedType,
        ContentLength: file.size,
      })
    );

    // Build document data — documentType is hardcoded to RATE_CONFIRMATION for load docs
    const documentData: Record<string, unknown> = {
      fileName: file.name,
      s3Key,
      contentType: validation.detectedType,
      sizeBytes: file.size,
      loadId,
      documentType: 'RATE_CONFIRMATION',
    };

    if (notes) {
      documentData.notes = notes;
    }

    // Validate with Zod schema
    const result = documentCreateSchema.safeParse(documentData);

    if (!result.success) {
      return {
        error: result.error.flatten().fieldErrors,
      };
    }

    // Create document via repository
    const repo = new DocumentRepository(tenantId);
    const document = await repo.create({
      ...result.data,
      tenantId,
      uploadedBy: user.id,
    });

    // Revalidate load detail page
    revalidatePath(`/loads/${loadId}`);

    return {
      success: true,
      document,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to upload document',
    };
  }
}

/**
 * List all rate confirmation documents for a load.
 * Requires OWNER or MANAGER role.
 */
export async function listLoadDocuments(loadId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // List documents via repository
    const repo = new DocumentRepository(tenantId);
    const documents = await repo.findByLoadId(loadId);

    return documents;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to list load documents');
  }
}

/**
 * Delete a load document (both S3 object and database record).
 * Requires OWNER or MANAGER role.
 */
export async function deleteLoadDocument(documentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // Find document first to get s3Key and loadId
    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(documentId);

    if (!doc) {
      return {
        error: 'Document not found',
      };
    }

    // CRITICAL: Defense-in-depth — verify s3Key starts with tenant prefix AND loads category
    if (!doc.s3Key.startsWith(`tenant-${tenantId}/loads/`)) {
      return {
        error: 'Invalid document: does not match tenant or category',
      };
    }

    // Delete from S3 first
    await deleteS3Object(doc.s3Key);

    // Delete from database
    await repo.delete(documentId);

    // Revalidate load page if loadId exists
    if (doc.loadId) {
      revalidatePath(`/loads/${doc.loadId}`);
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete document',
    };
  }
}
