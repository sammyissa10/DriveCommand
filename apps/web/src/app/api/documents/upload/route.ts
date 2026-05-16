/**
 * POST /api/documents/upload
 *
 * Server-proxied file upload to R2/S3.
 * Accepts multipart/form-data, uploads to R2 directly from the server,
 * then saves document metadata to the database.
 *
 * Upload pipeline (quick-349):
 * 1. Upload to quarantine prefix: tenant-{id}/_quarantine/{fileId}-{name}
 * 2. Validate file type (magic bytes), dimensions, macro formats, SVG/HTML
 * 3. On pass: copy to final key and delete quarantine
 * 4. On fail: delete quarantine object, return error
 *
 * This avoids the browser CORS restrictions that prevent direct-to-R2 PUT requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { documentCreateSchema } from '@drivecommand/validation';
import {
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import {
  MAX_FILE_SIZE,
  validateFileType,
  validateImageDimensions,
  validatePdfPageCount,
  validateNoMacroFormats,
  validateNoSvgHtml,
  sanitizeFilename,
  ValidationError,
} from '@/lib/storage/validate';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/security/errors';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Delete a quarantine object — best-effort (logs but does not throw) */
async function deleteQuarantineObject(s3Key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: s3Key }));
  } catch (err) {
    logger.warn('[upload] Failed to delete quarantine object', { s3Key, error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  let step = 'init';
  let quarantineKey = '';

  try {
    step = 'require-role';
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    step = 'require-tenant';
    const tenantId = await requireTenantId();

    step = 'rate-limit';
    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    step = 'get-user';
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    step = 'parse-form';
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const entityType = formData.get('entityType') as string | null;
    const entityId = formData.get('entityId') as string | null;
    const documentName = formData.get('documentName') as string | null;
    const description = formData.get('description') as string | null;
    const externalUrl = formData.get('externalUrl') as string | null;
    const expiryDate = formData.get('expiryDate') as string | null;

    if (!entityType || !entityId || !documentName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    step = 's3-upload';
    let finalS3Key = '';
    let contentType = '';
    let sizeBytes = 0;

    if (file && file.size > 0) {
      // Basic type + size checks
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed. Please upload a PDF, JPEG, or PNG file.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
          { status: 400 }
        );
      }

      const fileId = nanoid();
      const sanitizedName = sanitizeFilename(file.name);
      const category = entityType === 'truck' ? 'trucks' : 'routes';
      contentType = file.type;
      sizeBytes = file.size;

      const fileBuffer = Buffer.from(await file.arrayBuffer());

      // Step 1: Upload to quarantine prefix
      step = 'upload-quarantine';
      quarantineKey = `tenant-${tenantId}/_quarantine/${fileId}-${sanitizedName}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: getBucketName(),
          Key: quarantineKey,
          Body: fileBuffer,
          ContentType: contentType,
          ContentLength: sizeBytes,
        })
      );

      // Step 2: Validate using in-memory buffer (no GetObject needed — file is already in memory)
      step = 'validate';

      // 2a. MIME type magic bytes check
      const typeResult = await validateFileType(fileBuffer.buffer as ArrayBuffer, contentType);
      if (!typeResult.valid) {
        await deleteQuarantineObject(quarantineKey);
        return apiError(422, 'INVALID_FILE_TYPE', { message: typeResult.error });
      }

      // 2b. SVG/HTML rejection
      try {
        validateNoSvgHtml(sanitizedName);
      } catch (err) {
        await deleteQuarantineObject(quarantineKey);
        if (err instanceof ValidationError) {
          return apiError(422, err.code, { message: err.message });
        }
        throw err;
      }

      // 2c. Macro-enabled Office format rejection
      try {
        validateNoMacroFormats(sanitizedName, fileBuffer);
      } catch (err) {
        await deleteQuarantineObject(quarantineKey);
        if (err instanceof ValidationError) {
          return apiError(422, err.code, { message: err.message });
        }
        throw err;
      }

      // 2d. PDF page count check
      if (contentType === 'application/pdf') {
        try {
          await validatePdfPageCount(fileBuffer);
        } catch (err) {
          await deleteQuarantineObject(quarantineKey);
          if (err instanceof ValidationError) {
            return apiError(422, err.code, { message: err.message });
          }
          throw err;
        }
      }

      // 2e. Image dimension check (decompression bomb)
      if (contentType.startsWith('image/')) {
        try {
          await validateImageDimensions(fileBuffer);
        } catch (err) {
          await deleteQuarantineObject(quarantineKey);
          if (err instanceof ValidationError) {
            return apiError(422, err.code, { message: err.message });
          }
          throw err;
        }
      }

      // Step 3: Promote — copy quarantine → final key, then delete quarantine
      step = 'promote';
      finalS3Key = `tenant-${tenantId}/${category}/${fileId}-${sanitizedName}`;
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: getBucketName(),
          CopySource: `${getBucketName()}/${quarantineKey}`,
          Key: finalS3Key,
          ContentType: contentType,
        })
      );
      await deleteQuarantineObject(quarantineKey);
      quarantineKey = ''; // Mark as promoted — no cleanup needed on error
    }

    step = 'save-db';
    const documentData: any = {
      fileName: documentName.trim(),
      s3Key: finalS3Key,
      contentType,
      sizeBytes,
    };

    if (entityType === 'truck') {
      documentData.truckId = entityId;
    } else {
      documentData.routeId = entityId;
    }

    if (description?.trim()) documentData.description = description.trim();
    if (externalUrl?.trim()) documentData.externalUrl = externalUrl.trim();
    if (expiryDate) documentData.expiryDate = new Date(expiryDate);

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
    // Best-effort quarantine cleanup if an unexpected error occurs after upload
    if (quarantineKey) {
      await deleteQuarantineObject(quarantineKey);
    }
    logger.error(`[upload] CAUGHT ERROR at step=${step}:`, error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
