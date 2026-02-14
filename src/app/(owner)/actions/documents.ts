'use server';

/**
 * Server actions for document upload, download, delete, and list operations.
 * All actions enforce role-based authorization before any data access.
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { validateFileType, MAX_FILE_SIZE } from '@/lib/storage/validate';
import { generateUploadUrl, generateDownloadUrl, deleteS3Object } from '@/lib/storage/presigned';
import { documentCreateSchema } from '@/lib/validations/document.schemas';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

/**
 * Request a presigned upload URL for a file.
 * Validates file type using magic bytes before generating URL.
 * Requires OWNER or MANAGER role.
 */
export async function requestUploadUrl(formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Extract form data
    const file = formData.get('file') as File;
    const entityType = formData.get('entityType') as 'truck' | 'route';
    const entityId = formData.get('entityId') as string;

    if (!file || !entityType || !entityId) {
      return {
        error: 'Missing required fields: file, entityType, and entityId are required',
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

    // Generate unique file ID
    const fileId = nanoid();

    // Sanitize filename (remove path separators)
    const sanitizedFileName = file.name.replace(/[/\\]/g, '-');

    // Determine category from entity type
    const category = entityType === 'truck' ? 'trucks' : 'routes';

    // Generate presigned upload URL
    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      category,
      fileId,
      sanitizedFileName,
      validation.detectedType,
      file.size
    );

    return {
      uploadUrl,
      s3Key,
      fileId,
      fileName: file.name,
      contentType: validation.detectedType,
      sizeBytes: file.size,
      entityType,
      entityId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    };
  }
}

/**
 * Complete the upload process by saving document metadata to database.
 * Called after the client successfully uploads to S3.
 * Requires OWNER or MANAGER role.
 */
export async function completeUpload(data: {
  s3Key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  entityType: 'truck' | 'route';
  entityId: string;
}) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID and current user
    const tenantId = await requireTenantId();
    const user = await getCurrentUser();

    if (!user) {
      return {
        error: 'User not found',
      };
    }

    // CRITICAL: Verify s3Key starts with tenant prefix (defense in depth)
    if (!data.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return {
        error: 'Invalid S3 key: does not match tenant',
      };
    }

    // Build document data based on entity type
    const documentData: any = {
      fileName: data.fileName,
      s3Key: data.s3Key,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
    };

    if (data.entityType === 'truck') {
      documentData.truckId = data.entityId;
    } else {
      documentData.routeId = data.entityId;
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

    // Revalidate the entity detail page
    const entityPath =
      data.entityType === 'truck' ? `/trucks/${data.entityId}` : `/routes/${data.entityId}`;
    revalidatePath(entityPath);

    return {
      success: true,
      document,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to complete upload',
    };
  }
}

/**
 * Generate a presigned download URL for a document.
 * Requires OWNER, MANAGER, or DRIVER role (drivers need to view route documents).
 */
export async function getDownloadUrl(documentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // Find document via repository (RLS ensures tenant isolation)
    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(documentId);

    if (!doc) {
      return {
        error: 'Document not found',
      };
    }

    // CRITICAL: Verify s3Key starts with tenant prefix (defense in depth)
    if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return {
        error: 'Invalid document: does not match tenant',
      };
    }

    // Generate presigned download URL
    const downloadUrl = await generateDownloadUrl(doc.s3Key);

    return {
      downloadUrl,
      fileName: doc.fileName,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to generate download URL',
    };
  }
}

/**
 * Delete a document (both S3 object and database record).
 * Requires OWNER or MANAGER role.
 */
export async function deleteDocument(documentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // Find document first to get s3Key and entity association
    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(documentId);

    if (!doc) {
      return {
        error: 'Document not found',
      };
    }

    // CRITICAL: Verify s3Key starts with tenant prefix (defense in depth)
    if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return {
        error: 'Invalid document: does not match tenant',
      };
    }

    // Delete from S3 first
    await deleteS3Object(doc.s3Key);

    // Delete from database
    await repo.delete(documentId);

    // Revalidate the entity detail page
    const entityPath = doc.truckId ? `/trucks/${doc.truckId}` : `/routes/${doc.routeId}`;
    revalidatePath(entityPath);

    return {
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete document',
    };
  }
}

/**
 * List all documents for a truck or route.
 * Requires OWNER, MANAGER, or DRIVER role.
 */
export async function listDocuments(entityType: 'truck' | 'route', entityId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // List documents via repository
    const repo = new DocumentRepository(tenantId);
    const documents =
      entityType === 'truck'
        ? await repo.findByTruckId(entityId)
        : await repo.findByRouteId(entityId);

    return documents;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to list documents');
  }
}
