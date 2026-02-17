'use server';

/**
 * Server actions for driver document operations.
 * Handles both small files (single PUT) and large files (via multipart API routes).
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
 * Request a presigned upload URL for a small driver document file (<5MB).
 * For large files (>5MB), use the multipart upload API routes instead.
 * Requires OWNER or MANAGER role.
 */
export async function requestDriverUploadUrl(formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Extract form data
    const file = formData.get('file') as File;
    const driverId = formData.get('driverId') as string;
    const documentType = formData.get('documentType') as string;
    const expiryDate = formData.get('expiryDate') as string | null;
    const notes = formData.get('notes') as string | null;

    if (!file || !driverId || !documentType) {
      return {
        error: 'Missing required fields: file, driverId, and documentType are required',
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

    // Generate presigned upload URL (category: drivers)
    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      'drivers',
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
      driverId,
      documentType,
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    };
  }
}

/**
 * Complete the upload process by saving driver document metadata to database.
 * Called after the client successfully uploads to S3 (for small files).
 * Requires OWNER or MANAGER role.
 */
export async function completeDriverDocumentUpload(data: {
  s3Key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  driverId: string;
  documentType: string;
  expiryDate?: string;
  notes?: string;
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

    // CRITICAL: Defense-in-depth - verify s3Key starts with tenant prefix AND drivers category
    if (!data.s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
      return {
        error: 'Invalid S3 key: does not match tenant or category',
      };
    }

    // Build document data
    const documentData: any = {
      fileName: data.fileName,
      s3Key: data.s3Key,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      driverId: data.driverId,
      documentType: data.documentType,
    };

    if (data.expiryDate) {
      documentData.expiryDate = new Date(data.expiryDate);
    }

    if (data.notes) {
      documentData.notes = data.notes;
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

    // Revalidate driver page
    revalidatePath(`/drivers/${data.driverId}`);

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
 * List all documents for a driver.
 * Requires OWNER, MANAGER, or DRIVER role.
 */
export async function listDriverDocuments(driverId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // List documents via repository
    const repo = new DocumentRepository(tenantId);
    const documents = await repo.findByDriverId(driverId);

    return documents;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to list driver documents');
  }
}

/**
 * Delete a driver document (both S3 object and database record).
 * Requires OWNER or MANAGER role.
 */
export async function deleteDriverDocument(documentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // Find document first to get s3Key and driverId
    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(documentId);

    if (!doc) {
      return {
        error: 'Document not found',
      };
    }

    // CRITICAL: Defense-in-depth - verify s3Key starts with tenant prefix AND drivers category
    if (!doc.s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
      return {
        error: 'Invalid document: does not match tenant or category',
      };
    }

    // Delete from S3 first
    await deleteS3Object(doc.s3Key);

    // Delete from database
    await repo.delete(documentId);

    // Revalidate driver page (if driverId exists)
    if (doc.driverId) {
      revalidatePath(`/drivers/${doc.driverId}`);
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete driver document',
    };
  }
}

/**
 * Update driver document metadata (expiry date, notes, document type).
 * Requires OWNER or MANAGER role.
 */
export async function updateDriverDocument(
  documentId: string,
  data: {
    expiryDate?: string;
    notes?: string;
    documentType?: string;
  }
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    // Get tenant ID
    const tenantId = await requireTenantId();

    // Find document first to verify ownership
    const repo = new DocumentRepository(tenantId);
    const doc = await repo.findById(documentId);

    if (!doc) {
      return {
        error: 'Document not found',
      };
    }

    // CRITICAL: Verify this is a driver document
    if (!doc.driverId) {
      return {
        error: 'Document is not a driver document',
      };
    }

    // Build update data
    const updateData: any = {};

    if (data.expiryDate !== undefined) {
      updateData.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes || null;
    }

    if (data.documentType !== undefined) {
      updateData.documentType = data.documentType;
    }

    // Update via repository
    const updated = await repo.update(documentId, updateData);

    // Revalidate driver page
    revalidatePath(`/drivers/${doc.driverId}`);

    return {
      success: true,
      document: updated,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to update driver document',
    };
  }
}
