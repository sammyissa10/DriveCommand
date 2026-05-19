import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db/prisma';

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const tenantId = session.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

    const rateLimited = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const truck = await prisma.carrierTruck.findFirst({
      where: { id, orgId: tenantId },
      select: { id: true },
    });
    if (!truck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as {
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
    };
    const { fileName, contentType, sizeBytes } = body;

    if (!fileName || !contentType || sizeBytes == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, or WebP images are allowed' },
        { status: 400 }
      );
    }

    if (sizeBytes > MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: 'Photo exceeds 5MB limit' }, { status: 400 });
    }

    const fileId = nanoid();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { uploadUrl, s3Key } = await generateUploadUrl(
      tenantId,
      'trucks',
      fileId,
      safeName,
      contentType,
      sizeBytes
    );

    return NextResponse.json({ uploadUrl, s3Key });
  } catch (err) {
    logger.error('[truck photo-upload-url] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
