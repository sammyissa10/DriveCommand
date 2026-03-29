import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { nanoid } from 'nanoid';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/mobile/support/upload-screenshot
 *
 * Accepts a multipart form upload (field: "screenshot") and stores it
 * directly in S3 server-side. Returns { s3Key } on success.
 *
 * Server-side upload avoids presigned-URL signature issues and binary
 * body corruption that occur when uploading directly from React Native.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const file = formData.get('screenshot') as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No screenshot provided' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Screenshot must be 10MB or less' }, { status: 400 });
  }

  const contentType = file.type || 'image/jpeg';
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Only JPEG and PNG screenshots are accepted' }, { status: 400 });
  }

  try {
    const fileId = nanoid();
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const s3Key = `tenant-${auth.tenantId}/support/${fileId}-screenshot.${ext}`;
    const body = Buffer.from(await file.arrayBuffer());

    await s3Client.send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: s3Key,
      Body: body,
      ContentType: contentType,
      ContentLength: file.size,
    }));

    return NextResponse.json({ s3Key });
  } catch (err) {
    console.error('[mobile/support/upload-screenshot] S3 upload error:', err);
    return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 });
  }
}
