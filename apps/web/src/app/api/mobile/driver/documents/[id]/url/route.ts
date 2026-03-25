import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';

/**
 * GET /api/mobile/driver/documents/[id]/url
 *
 * Generates a presigned S3 GET URL for the specified document.
 * Verifies the document belongs to the authenticated driver.
 *
 * Returns: { url: string }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { driverId } = auth;
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.findUnique({
        where: { id },
        select: { id: true, driverId: true, s3Key: true, contentType: true },
      });
    }, TX_OPTIONS);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Security: verify this document belongs to the requesting driver
    if (document.driverId !== driverId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate presigned GET URL (15 min expiry)
    const command = new GetObjectCommand({
      Bucket: getBucketName(),
      Key: document.s3Key,
      ResponseContentDisposition: 'inline',
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[mobile/driver/documents/[id]/url GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
