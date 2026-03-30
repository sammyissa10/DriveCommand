import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { nanoid } from 'nanoid';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/mobile/support/upload-screenshot
 *
 * Accepts a JSON body { base64: string, mimeType: string } and stores the
 * decoded image in Supabase Storage via the admin client (service role).
 *
 * Uses the Supabase JS SDK which handles sb_secret_* key format normalization
 * internally. Returns { s3Key }.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  let body: { base64?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const { base64, mimeType: rawMimeType } = body;

  if (typeof base64 !== 'string' || !base64) {
    return NextResponse.json({ error: 'Missing base64 field' }, { status: 400 });
  }

  const mimeType = typeof rawMimeType === 'string' ? rawMimeType : 'image/jpeg';
  const contentType = ALLOWED_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const imageBuffer = Buffer.from(base64, 'base64');

  if (imageBuffer.byteLength === 0) {
    return NextResponse.json({ error: 'Empty screenshot' }, { status: 400 });
  }

  if (imageBuffer.byteLength > MAX_SIZE) {
    return NextResponse.json({ error: 'Screenshot must be 10MB or less' }, { status: 400 });
  }

  try {
    const fileId = nanoid();
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const s3Key = `tenant-${auth.tenantId}/support/${fileId}-screenshot.${ext}`;
    const bucket = process.env.S3_BUCKET || 'driver-documents';

    const supabase = createAdminClient();
    const { error } = await supabase.storage.from(bucket).upload(s3Key, imageBuffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      console.error('[mobile/support/upload-screenshot] Supabase upload failed:', error);
      return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 });
    }

    return NextResponse.json({ s3Key });
  } catch (err) {
    console.error('[mobile/support/upload-screenshot] unexpected error:', err);
    return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 });
  }
}
