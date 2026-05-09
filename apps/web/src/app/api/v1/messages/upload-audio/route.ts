/**
 * POST /api/v1/messages/upload-audio
 *
 * Upload an audio file (voice message) to R2 storage with tenant isolation.
 * Returns the R2 key (not a signed URL) which is stored in FleetMessage.audioUrl.
 *
 * Body: multipart FormData with an `audio` file field.
 * Max size: 10MB. Allowed types: audio/webm, audio/mp4, audio/ogg, audio/mpeg.
 *
 * Requires: session with OWNER, MANAGER, or DRIVER role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';

const AUDIO_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'MANAGER', 'DRIVER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId } = session;

  // Rate limit by tenant
  const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
  if (rateLimited) return rateLimited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: 'audio field is required' }, { status: 400 });
  }

  // Validate file size
  if (audioFile.size > AUDIO_MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Audio file must be under 10MB' }, { status: 400 });
  }

  // Validate content type
  const contentType = audioFile.type || 'audio/webm';
  if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: 'Only audio/webm, audio/mp4, audio/ogg, and audio/mpeg are accepted' },
      { status: 400 }
    );
  }

  try {
    const fileId = nanoid();
    const sanitizedFileName = audioFile.name.replace(/[/\\]/g, '-') || `recording-${fileId}.webm`;
    const s3Key = `tenant-${tenantId}/messages/audio/${fileId}-${sanitizedFileName}`;

    // Read the file buffer
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Upload directly to R2 using PutObjectCommand
    const command = new PutObjectCommand({
      Bucket: getBucketName(),
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    });

    await s3Client.send(command);

    return NextResponse.json({ audioUrl: s3Key }, { status: 201 });
  } catch (err) {
    logger.error('[api/v1/messages/upload-audio POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
