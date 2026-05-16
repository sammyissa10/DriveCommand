/**
 * POST /api/documents/request-upload-url
 *
 * Generate a presigned S3 upload URL for a truck or route document.
 * Client validates file type before calling; server generates the presigned URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { isRestrictedDocumentType, generateRestrictedUploadUrl } from '@/lib/storage/restricted';
import { MAX_FILE_SIZE, sanitizeFilename } from '@/lib/storage/validate';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { DocumentType } from '@/generated/prisma';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(req: NextRequest) {
  let step = 'init';
  try {
    step = 'require-role';
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    step = 'require-tenant';
    const tenantId = await requireTenantId();

    step = 'rate-limit';
    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    step = 'parse-body';
    const body = await req.json();
    const { entityType, entityId, fileName, contentType, sizeBytes, documentType, driverId } = body as {
      entityType?: string;
      entityId?: string;
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
      documentType?: DocumentType;
      driverId?: string;
    };

    if (!entityType || !entityId || !fileName || !contentType || !sizeBytes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Content type not allowed. Allowed: PDF, JPEG, PNG.' },
        { status: 400 }
      );
    }

    if (sizeBytes > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    step = 'generate-file-id';
    const fileId = nanoid();
    // Use sanitizeFilename (not just path separator replacement) for full hardening
    const sanitizedFileName = sanitizeFilename(fileName as string);

    // Restricted document type branch — routes to dedicated /restricted/ prefix with shorter expiry
    if (isRestrictedDocumentType(documentType)) {
      step = 'generate-restricted-upload-url';
      const { uploadUrl, s3Key } = await generateRestrictedUploadUrl({
        tenantId,
        driverId: driverId ?? null,
        fileId,
        fileName: sanitizedFileName,
        contentType,
      });
      step = 'done';
      return NextResponse.json({
        uploadUrl,
        s3Key,
        fileId,
        fileName,
        contentType,
        sizeBytes,
        entityType,
        entityId,
        documentType,
        isRestricted: true,
      });
    }

    // Non-restricted flow — quarantine prefix first, validated on upload completion
    step = 'generate-upload-url';
    // Files go to _quarantine/ prefix; after validation in /upload route they are promoted to final key.
    // generateUploadUrl builds: tenant-{tenantId}/{category}/{fileId}-{fileName}
    // Using '_quarantine' as category yields: tenant-{tenantId}/_quarantine/{fileId}-{sanitizedFileName}
    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      '_quarantine' as any,
      fileId,
      sanitizedFileName,
      contentType,
      sizeBytes
    );

    step = 'done';
    return NextResponse.json({
      uploadUrl,
      s3Key,
      fileId,
      fileName: sanitizedFileName,
      contentType,
      sizeBytes,
      entityType,
      entityId,
      isRestricted: false,
    });
  } catch (error) {
    logger.error(`[request-upload-url] CAUGHT ERROR at step=${step}:`, error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
