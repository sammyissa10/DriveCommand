'use server';

/**
 * Server actions for document upload, download, delete, and list operations.
 * All actions enforce role-based authorization before any data access.
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { MAX_FILE_SIZE } from '@/lib/storage/validate';
import { generateUploadUrl, generateDownloadUrl, deleteS3Object } from '@/lib/storage/presigned';
import { documentCreateSchema } from '@drivecommand/validation';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

/**
 * Request a presigned upload URL for a file.
 * Client validates file type before calling; server generates the presigned URL.
 * Requires OWNER or MANAGER role.
 */
export async function requestUploadUrl(
  entityType: 'truck' | 'route',
  entityId: string,
  fileName: string,
  contentType: string,
  sizeBytes: number
) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    if (!entityType || !entityId || !fileName || !contentType || !sizeBytes) {
      return { error: 'Missing required fields' };
    }

    if (sizeBytes > MAX_FILE_SIZE) {
      return { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
    }

    const tenantId = await requireTenantId();
    const fileId = nanoid();
    const sanitizedFileName = fileName.replace(/[/\\]/g, '-');
    const category = entityType === 'truck' ? 'trucks' : 'routes';

    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      category,
      fileId,
      sanitizedFileName,
      contentType,
      sizeBytes
    );

    return { uploadUrl, s3Key, fileId, fileName, contentType, sizeBytes, entityType, entityId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to generate upload URL' };
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
  description?: string;
  externalUrl?: string;
  expiryDate?: string; // ISO string
  documentName?: string;
}) {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    const tenantId = await requireTenantId();
    const user = await getCurrentUser();

    if (!user) {
      return { error: 'User not found' };
    }

    if (data.s3Key && !data.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return { error: 'Invalid S3 key: does not match tenant' };
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
      return { error: messages || 'Invalid document data' };
    }

    const repo = new DocumentRepository(tenantId);
    await repo.create({
      ...result.data,
      tenantId,
      uploadedBy: user.id,
    });

    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to complete upload' };
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

    // Link-only documents have no s3Key — cannot generate a download URL
    if (!doc.s3Key) {
      return {
        error: 'This document has no file attached. Use the online link to view it.',
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
    // Skip check for link-only documents (empty s3Key)
    if (doc.s3Key && !doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
      return {
        error: 'Invalid document: does not match tenant',
      };
    }

    // Delete from S3 only if a file was stored
    if (doc.s3Key) {
      await deleteS3Object(doc.s3Key);
    }

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
