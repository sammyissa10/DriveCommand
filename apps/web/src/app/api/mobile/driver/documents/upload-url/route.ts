import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { nanoid } from 'nanoid';

const ALLOWED_CONTENT_TYPES: Record<string, boolean> = {
  'application/pdf': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/heic': true,
  'image/webp': true,
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/mobile/driver/documents/upload-url
 *
 * Generates a presigned S3 PUT URL so the mobile app can upload
 * a document directly to S3 before creating the DB record.
 *
 * Body: { fileName, contentType, sizeBytes }
 * Returns: { uploadUrl, s3Key }
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { tenantId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { fileName, contentType, sizeBytes } = body as Record<string, unknown>;

  if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
  }

  if (!contentType || typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPES[contentType]) {
    return NextResponse.json(
      { error: 'contentType must be application/pdf, image/jpeg, image/png, image/heic, or image/webp' },
      { status: 400 }
    );
  }

  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes must be a positive number' }, { status: 400 });
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 400 }
    );
  }

  try {
    const fileId = nanoid();
    // Sanitize filename
    const sanitizedFileName = (fileName as string).trim().replace(/[/\\]/g, '-');

    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      'drivers',
      fileId,
      sanitizedFileName,
      contentType as string,
      sizeBytes as number
    );

    return NextResponse.json({ uploadUrl, s3Key });
  } catch (err) {
    console.error('[mobile/driver/documents/upload-url POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
