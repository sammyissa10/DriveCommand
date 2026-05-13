/**
 * GET  /api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments
 *   List attachments for a pay component (non-deleted only).
 *   storageKey is intentionally excluded from the response — clients use
 *   the /download-url sub-route to get a short-lived signed URL.
 *
 * POST /api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments?action=presign
 *   Generate a presigned PUT URL for direct-to-S3 upload.
 *   Returns { uploadUrl, storageKey, expiresIn }.
 *
 * POST /api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments?action=confirm
 *   Confirm a completed upload and persist the attachment metadata.
 *   Returns { attachment } with 201 status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { getAttachmentUploadUrl } from '@/lib/storage/attachments';

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
] as const;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Serializer (storageKey intentionally excluded)
// ---------------------------------------------------------------------------

function serializeAttachment(a: {
  id: string;
  componentId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    componentId: a.componentId,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Shared: verify assignment + component access
// ---------------------------------------------------------------------------

async function resolveComponent(
  prisma: Awaited<ReturnType<typeof getTenantPrisma>>,
  assignmentId: string,
  componentId: string,
  userId: string,
  role: string,
) {
  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) return { error: 'Assignment not found.', status: 404 as const };

  const isDriver = role === 'driver' || role === 'DRIVER';
  if (isDriver && assignment.driverId !== userId) {
    // Per spec: cross-tenant access returns 404, not 403
    return { error: 'Assignment not found.', status: 404 as const };
  }

  const component = await prisma.loadPayComponent.findFirst({
    where: { id: componentId, assignmentId, deletedAt: null },
  });
  if (!component) return { error: 'Component not found.', status: 404 as const };

  return { assignment, component };
}

// ---------------------------------------------------------------------------
// GET — list attachments
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string; componentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId, componentId } = await params;
  const prisma = await getTenantPrisma();

  const resolved = await resolveComponent(
    prisma,
    assignmentId,
    componentId,
    session.userId,
    session.role,
  );
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const attachments = await prisma.payComponentAttachment.findMany({
    where: { componentId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ attachments: attachments.map(serializeAttachment) });
}

// ---------------------------------------------------------------------------
// POST — presign or confirm
// ---------------------------------------------------------------------------

const PresignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number(),
});

const ConfirmSchema = z.object({
  storageKey: z.string(),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string; componentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId, componentId } = await params;
  const action = req.nextUrl.searchParams.get('action');

  if (action !== 'presign' && action !== 'confirm') {
    return NextResponse.json(
      { error: 'Missing or invalid ?action= query param. Use ?action=presign or ?action=confirm.' },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const prisma = await getTenantPrisma();
  const tenantId = session.tenantId;

  // -------------------------------------------------------------------------
  // POST ?action=presign
  // -------------------------------------------------------------------------
  if (action === 'presign') {
    // Rate limit uploads per tenant
    const rateLimitResponse = await applyRateLimit(uploadLimiter, tenantId);
    if (rateLimitResponse) return rateLimitResponse;

    const parsed = PresignSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // MIME allow-list
    if (!ALLOWED_MIME_TYPES.includes(body.contentType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        {
          error: `File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Size check
    if (body.sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large — max 10MB.' },
        { status: 400 },
      );
    }

    // Re-check assignment + component access
    const resolved = await resolveComponent(
      prisma,
      assignmentId,
      componentId,
      session.userId,
      session.role,
    );
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    // PAID guard
    if ((resolved.assignment.payStatus as string) === 'PAID') {
      return NextResponse.json(
        { error: 'Cannot add attachments to a paid assignment.' },
        { status: 409 },
      );
    }

    const ext = MIME_TO_EXT[body.contentType] ?? 'bin';

    const { uploadUrl, storageKey } = await getAttachmentUploadUrl({
      tenantId,
      componentId,
      ext,
      contentType: body.contentType,
    });

    return NextResponse.json({ uploadUrl, storageKey, expiresIn: 900 });
  }

  // -------------------------------------------------------------------------
  // POST ?action=confirm
  // -------------------------------------------------------------------------
  const parsed = ConfirmSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Defense: storageKey must be owned by this tenant + component
  const expectedPrefix = `${tenantId}/components/${componentId}/`;
  if (!body.storageKey.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: 'Invalid storageKey.' },
      { status: 403 },
    );
  }

  // Re-check assignment + component access
  const resolved = await resolveComponent(
    prisma,
    assignmentId,
    componentId,
    session.userId,
    session.role,
  );
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // PAID guard
  if ((resolved.assignment.payStatus as string) === 'PAID') {
    return NextResponse.json(
      { error: 'Cannot add attachments to a paid assignment.' },
      { status: 409 },
    );
  }

  const attachment = await prisma.payComponentAttachment.create({
    data: {
      tenantId,
      componentId,
      assignmentId,
      storageKey: body.storageKey,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      uploadedBy: session.userId,
      createdBy: session.userId,
    },
  });

  return NextResponse.json({ attachment: serializeAttachment(attachment) }, { status: 201 });
}
