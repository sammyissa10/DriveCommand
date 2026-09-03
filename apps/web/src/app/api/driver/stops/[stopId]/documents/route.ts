import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
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

const VALID_DOCUMENT_TYPES = ['bol', 'pod', 'weight_ticket', 'fuel_receipt', 'other'];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/driver/stops/[stopId]/documents
 *
 * Upload a document for a specific stop (active or completed).
 * Does NOT change stop status on upload.
 *
 * FormData fields:
 *   - file: the document file (PDF or image)
 *   - documentType: bol | pod | weight_ticket | fuel_receipt | other
 *
 * Auth: Supabase cookie session — DRIVER role required.
 * Tenant isolation: Stop must belong to a dispatch assigned to this driver's org.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    await requireRole([UserRole.DRIVER]);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await applyRateLimit(uploadLimiter, session.userId);
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
  if (
    !documentType ||
    typeof documentType !== 'string' ||
    !VALID_DOCUMENT_TYPES.includes(documentType.toLowerCase())
  ) {
    return NextResponse.json(
      { error: `documentType must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate file
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
     * @bypass_rls reason: driver-web-api
     * WHY: Session cookie auth context — Carrier Ops tables require bypass_rls for
     *      server-side reads outside the RLS-scoped tenant connection.
     * SCOPE: Stop is validated to belong to a dispatch where primaryDriverId matches
     *        the authenticated driver's carrierDriver record AND orgId = session.tenantId.
     * SAFETY: Gated by requireRole([DRIVER]) + getSession() above.
     */

    // Step 1: Resolve the driver and verify stop ownership
    const tenantPrisma = await getTenantPrisma();
    const stopOwned = await tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: session.userId, orgId: session.tenantId },
        select: { id: true },
      });

      if (!carrierDriver) return false;

      const stop = await tx.carrierStop.findFirst({
        where: {
          id: stopId,
          dispatch: {
            primaryDriverId: carrierDriver.id,
            orgId: session.tenantId,
          },
        },
        select: { id: true },
      });

      return !!stop;
    }, TX_OPTIONS);

    if (!stopOwned) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }

    // Step 2: Generate R2 presigned upload URL
    const fileId = nanoid();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const sanitizedName = `${documentType.toLowerCase()}-${fileId}.${ext}`;

    const { uploadUrl, s3Key } = await generateUploadUrl(
      session.tenantId,
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
      logger.error('[driver/stops/documents POST] R2 upload failed:', {
        status: uploadRes.status,
        stopId,
      });
      return NextResponse.json({ error: 'File upload to storage failed' }, { status: 502 });
    }

    // Step 4: Create CarrierDocument record (does NOT change stop status)
    const doc = await tenantPrisma.$transaction(async (tx) => {
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
          uploadedBy: session.userId,
        },
        select: {
          id: true,
          documentType: true,
          filename: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json(
      {
        id: doc.id,
        documentType: doc.documentType,
        filename: doc.filename,
        createdAt: doc.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('[driver/stops/documents POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/driver/stops/[stopId]/documents
 *
 * List documents uploaded for a specific stop.
 * Auth: Same driver ownership check as POST.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    await requireRole([UserRole.DRIVER]);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { stopId } = await params;

  try {
    /**
     * @bypass_rls reason: driver-web-api
     * Same rationale as POST handler above.
     */
    const tenantPrisma = await getTenantPrisma();
    const docs = await tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: session.userId, orgId: session.tenantId },
        select: { id: true },
      });

      if (!carrierDriver) return null;

      const stop = await tx.carrierStop.findFirst({
        where: {
          id: stopId,
          dispatch: {
            primaryDriverId: carrierDriver.id,
            orgId: session.tenantId,
          },
        },
        select: { id: true },
      });

      if (!stop) return null;

      return tx.carrierDocument.findMany({
        where: { stopId },
        select: {
          id: true,
          documentType: true,
          filename: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }, TX_OPTIONS);

    if (docs === null) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }

    return NextResponse.json(
      docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))
    );
  } catch (err) {
    logger.error('[driver/stops/documents GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
