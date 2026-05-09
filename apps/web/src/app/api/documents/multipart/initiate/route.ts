/**
 * POST /api/documents/multipart/initiate
 *
 * Initiate multipart upload for large files (>5MB).
 * Returns uploadId and s3Key for subsequent part uploads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { initiateMultipartUpload } from '@/lib/storage/multipart';
import { ALLOWED_TYPES, MAX_FILE_SIZE } from '@/lib/storage/validate';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';

const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export async function POST(req: NextRequest) {
  try {
    // CRITICAL: Auth check FIRST before any data access
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    // Get tenant ID
    const tenantId = await requireTenantId();

    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    // Parse request body
    const body = await req.json();
    const { fileName, contentType, fileSize, entityType, entityId, totalParts } = body;

    // Validate required fields
    if (!fileName || !contentType || !fileSize || !entityType || !entityId || !totalParts) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, contentType, fileSize, entityType, entityId, totalParts' },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Validate content type — resolve from extension if browser-reported type is empty or non-standard
    // (mobile browsers may report empty string on Android or image/heic on iOS)
    let resolvedContentType: string;
    if (Object.keys(ALLOWED_TYPES).includes(contentType)) {
      resolvedContentType = contentType;
    } else {
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const mappedType = EXTENSION_MIME_MAP[ext];
      if (mappedType) {
        resolvedContentType = mappedType;
      } else {
        return NextResponse.json(
          { error: 'Content type must be PDF, JPEG, or PNG' },
          { status: 400 }
        );
      }
    }

    // Validate entity type (only driver supported for multipart uploads)
    if (entityType !== 'driver') {
      return NextResponse.json(
        { error: 'Entity type must be "driver" for multipart uploads' },
        { status: 400 }
      );
    }

    // Generate unique file ID
    const fileId = nanoid();

    // Sanitize filename (remove path separators)
    const sanitizedFileName = fileName.replace(/[/\\]/g, '-');

    // Initiate multipart upload
    const { uploadId, s3Key, totalParts: parts } = await initiateMultipartUpload(
      tenantId,
      'drivers',
      fileId,
      sanitizedFileName,
      resolvedContentType,
      totalParts
    );

    return NextResponse.json({
      uploadId,
      s3Key,
      fileId,
      totalParts: parts,
      resolvedContentType,
    });
  } catch (error) {
    logger.error('Multipart initiate error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate multipart upload' },
      { status: 500 }
    );
  }
}
