import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
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

const VALID_DOCUMENT_TYPES = ['bol', 'pod'];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/mobile/carrier/driver/stops/[stopId]/documents
 *
 * Accepts a multipart FormData upload containing:
 *   - file: the document file (image or PDF)
 *   - documentType: 'bol' | 'pod'
 *
 * Flow:
 *   1. Validate Bearer token + DRIVER role
 *   2. Validate stop belongs to a dispatch assigned to this driver's org
 *   3. Upload file bytes to R2 via presigned URL
 *   4. Create CarrierDocument record linking to the stop
 *   5. Return the created document
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'DRIVER') {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { stopId } = await params;

  // Parse multipart FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid FormData body' }, { status: 400 });
  }

  const fileEntry = formData.get('file');
  const documentType = formData.get('documentType');

  // Validate documentType
  if (!documentType || typeof documentType !== 'string' || !VALID_DOCUMENT_TYPES.includes(documentType.toLowerCase())) {
    return NextResponse.json(
      { error: `documentType must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate file presence
  if (!fileEntry || !(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'file is required and must be a File' }, { status: 400 });
  }

  const file = fileEntry as File;
  const mimeType = file.type || 'application/octet-stream';

  if (!ALLOWED_CONTENT_TYPES[mimeType]) {
    return NextResponse.json(
      { error: 'File type must be PDF or image (jpeg/png/heic/webp)' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File cannot be empty' }, { status: 400 });
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Stop is validated to belong to a dispatch in the same org as the authenticated driver.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */

    // Step 1: Verify stop belongs to a dispatch in driver's org
    const stop = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.carrierStop.findFirst({
        where: {
          id: stopId,
          dispatch: { orgId: auth.tenantId },
        },
        select: { id: true, dispatchId: true },
      });
    }, TX_OPTIONS);

    if (!stop) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }

    // Step 2: Generate R2 presigned upload URL
    const fileId = nanoid();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const sanitizedName = `${documentType.toLowerCase()}-${fileId}.${ext}`;

    const { uploadUrl, s3Key } = await generateUploadUrl(
      auth.tenantId,
      'drivers',
      fileId,
      sanitizedName,
      mimeType,
      file.size
    );

    // Step 3: Upload file to R2
    const fileBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      logger.error('[mobile/carrier/driver/stops/documents POST] R2 upload failed:', {
        status: uploadRes.status,
        stopId,
      });
      return NextResponse.json({ error: 'File upload to storage failed' }, { status: 502 });
    }

    // Step 4: Create CarrierDocument record
    const doc = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.carrierDocument.create({
        data: {
          parentType: 'stop',
          parentId: stopId,
          stopId,
          documentType: documentType.toLowerCase(),
          fileUrl: s3Key,
          filename: file.name || sanitizedName,
          fileSizeBytes: file.size,
          uploadedBy: auth.userId,
        },
        select: {
          id: true,
          documentType: true,
          filename: true,
          fileUrl: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json(
      {
        id: doc.id,
        documentType: doc.documentType,
        filename: doc.filename,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('[mobile/carrier/driver/stops/documents POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
