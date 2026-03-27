import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { nanoid } from 'nanoid';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/mobile/driver/incidents/upload-photo
 *
 * Generates a presigned S3 upload URL for an incident photo.
 * Mobile client uploads directly to S3 using the returned URL.
 *
 * Body: { fileName, contentType, sizeBytes }
 * Returns: { uploadUrl, s3Key }
 *
 * Requires: Authorization: Bearer <token> (DRIVER role)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { fileName, contentType, sizeBytes } = body as Record<string, unknown>;

  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
  }

  if (!contentType || typeof contentType !== 'string') {
    return NextResponse.json({ error: 'contentType is required' }, { status: 400 });
  }

  if (!sizeBytes || typeof sizeBytes !== 'number') {
    return NextResponse.json({ error: 'sizeBytes must be a number' }, { status: 400 });
  }

  // Validate content type — allow JPEG and PNG only for photos
  const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: 'contentType must be image/jpeg or image/png' },
      { status: 400 }
    );
  }

  // Limit photo size to 10MB
  const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
  if (sizeBytes > MAX_PHOTO_SIZE) {
    return NextResponse.json(
      { error: 'Photo size must be 10MB or less' },
      { status: 400 }
    );
  }

  try {
    const fileId = nanoid();
    const sanitizedFileName = (fileName as string).replace(/[/\\]/g, '-');

    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      'drivers',
      fileId,
      sanitizedFileName,
      contentType,
      sizeBytes
    );

    return NextResponse.json({ uploadUrl, s3Key });
  } catch (err) {
    console.error('[mobile/driver/incidents/upload-photo] error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
