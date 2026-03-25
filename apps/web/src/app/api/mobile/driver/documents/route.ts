import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * Compute document expiry status based on expiry date.
 * - EXPIRED: past today
 * - EXPIRING: within 30 days
 * - VALID: more than 30 days away or no expiry
 */
function computeStatus(expiryDate: Date | null): 'VALID' | 'EXPIRING' | 'EXPIRED' {
  if (!expiryDate) return 'VALID';
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return 'EXPIRED';
  if (expiryDate < thirtyDaysFromNow) return 'EXPIRING';
  return 'VALID';
}

/**
 * GET /api/mobile/driver/documents
 *
 * Returns all documents for the authenticated driver, sorted with
 * expired first, then expiring, then valid.
 *
 * Note: mobile document type key is stored in the `description` field.
 * The `documentType` field returns the mobile type key (from description).
 *
 * Returns: { documents: DriverDocument[] }
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { driverId, tenantId } = auth;

  try {
    const documents = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.findMany({
        where: { driverId, tenantId },
        orderBy: { expiryDate: 'asc' },
        select: {
          id: true,
          fileName: true,
          s3Key: true,
          contentType: true,
          sizeBytes: true,
          description: true, // stores mobile document type key (e.g. "CDL", "MEDICAL_CARD")
          expiryDate: true,
          notes: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Add computed status and sort: EXPIRED first, then EXPIRING, then VALID
    const statusOrder: Record<string, number> = { EXPIRED: 0, EXPIRING: 1, VALID: 2 };
    const withStatus = documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      s3Key: doc.s3Key,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      documentType: doc.description ?? null, // mobile doc type key stored in description
      expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
      notes: doc.notes ?? null,
      createdAt: doc.createdAt.toISOString(),
      status: computeStatus(doc.expiryDate),
    }));

    withStatus.sort((a, b) => (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2));

    return NextResponse.json({ documents: withStatus });
  } catch (err) {
    console.error('[mobile/driver/documents GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const VALID_DOCUMENT_TYPES = [
  'CDL',
  'MEDICAL_CARD',
  'HAZMAT',
  'INSURANCE',
  'REGISTRATION',
  'INSPECTION',
  'OTHER',
];

const ALLOWED_CONTENT_TYPES: Record<string, boolean> = {
  'application/pdf': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/heic': true,
  'image/webp': true,
};

/**
 * POST /api/mobile/driver/documents
 *
 * Creates a DriverDocument record for the authenticated driver.
 * The file must already be uploaded to S3 before calling this endpoint.
 *
 * Body: { type, name, expiryDate?, s3Key, contentType, sizeBytes }
 *
 * Implementation note: the mobile document type key (e.g. "CDL") is stored in the
 * `description` field since the DB `documentType` enum is for web-side categories.
 * The `documentType` field in the DB is set to 'GENERAL' for all mobile uploads.
 *
 * Returns 201 with { document: DriverDocument }
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { driverId, tenantId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, name, expiryDate, s3Key, contentType, sizeBytes } = body as Record<string, unknown>;

  // Validate required fields
  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  if (!VALID_DOCUMENT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  if (!s3Key || typeof s3Key !== 'string') {
    return NextResponse.json({ error: 's3Key is required' }, { status: 400 });
  }

  // CRITICAL: Verify s3Key belongs to this tenant and is in the drivers category
  if (!s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
    return NextResponse.json({ error: 'Invalid s3Key: does not match tenant' }, { status: 400 });
  }

  if (!contentType || typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPES[contentType]) {
    return NextResponse.json(
      { error: 'contentType must be a valid document type (PDF or image)' },
      { status: 400 }
    );
  }

  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes must be a positive number' }, { status: 400 });
  }

  // Validate optional expiry date
  let expiryDateParsed: Date | null = null;
  if (expiryDate !== undefined && expiryDate !== null) {
    if (typeof expiryDate !== 'string') {
      return NextResponse.json({ error: 'expiryDate must be an ISO string' }, { status: 400 });
    }
    expiryDateParsed = new Date(expiryDate);
    if (isNaN(expiryDateParsed.getTime())) {
      return NextResponse.json({ error: 'expiryDate is not a valid date' }, { status: 400 });
    }
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.create({
        data: {
          tenantId,
          driverId,
          fileName: (name as string).trim(),
          s3Key: s3Key as string,
          contentType: contentType as string,
          sizeBytes: sizeBytes as number,
          documentType: 'GENERAL', // DB enum — mobile type key stored in description
          description: type as string, // stores "CDL", "MEDICAL_CARD", etc.
          expiryDate: expiryDateParsed,
          uploadedBy: driverId, // driver is uploading their own document
        },
        select: {
          id: true,
          fileName: true,
          s3Key: true,
          contentType: true,
          sizeBytes: true,
          description: true,
          expiryDate: true,
          notes: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    const response = {
      id: document.id,
      fileName: document.fileName,
      s3Key: document.s3Key,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      documentType: document.description ?? null,
      expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
      notes: document.notes ?? null,
      createdAt: document.createdAt.toISOString(),
      status: computeStatus(document.expiryDate),
    };

    return NextResponse.json({ document: response }, { status: 201 });
  } catch (err) {
    console.error('[mobile/driver/documents POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
