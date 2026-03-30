/**
 * POST /api/support/upload-attachment
 *
 * Generate a presigned S3 upload URL for a support ticket attachment.
 * Any authenticated user can upload. Max file size: 10MB. Allowed types: images and PDF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { requireTenantId } from '@/lib/context/tenant-context';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';

const SUPPORT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  let step = 'init';
  try {
    step = 'require-auth';
    await requireAuth();

    step = 'require-tenant';
    const tenantId = await requireTenantId();

    step = 'parse-body';
    const body = await req.json();
    const { fileName, contentType, sizeBytes } = body;

    if (!fileName || !contentType || !sizeBytes) {
      return NextResponse.json({ error: 'Missing required fields: fileName, contentType, sizeBytes' }, { status: 400 });
    }

    // Validate content type: must be image/* or application/pdf
    if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only images and PDFs are accepted' },
        { status: 400 }
      );
    }

    // Validate file size: max 10MB for support attachments
    if (sizeBytes > SUPPORT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File must be under 10MB' },
        { status: 400 }
      );
    }

    step = 'generate-file-id';
    const fileId = nanoid();
    const sanitizedFileName = (fileName as string).replace(/[/\\]/g, '-');

    step = 'generate-upload-url';
    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      'support',
      fileId,
      sanitizedFileName,
      contentType,
      sizeBytes
    );

    step = 'done';
    return NextResponse.json({ uploadUrl, s3Key });
  } catch (error) {
    logger.error(`[support/upload-attachment] CAUGHT ERROR at step=${step}:`, error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: `[upload-attachment:${step}] ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
