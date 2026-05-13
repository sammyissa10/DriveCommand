/**
 * GET /api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url
 *   Returns a short-lived (15-minute) presigned download URL for an attachment.
 *   Re-checks access on every request — download URLs are not cacheable.
 *
 * Access rules:
 *   - All authenticated users in the same tenant can get download URLs.
 *   - Driver: returns 404 if the assignment's driverId does not match session.userId.
 *   - Soft-deleted attachment: 404.
 *   - Cross-tenant: 404 (enforced by tenant-scoped Prisma RLS + explicit checks).
 *
 * Response headers: Cache-Control: no-store, must-revalidate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { getAttachmentDownloadUrl } from '@/lib/storage/attachments';

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ assignmentId: string; componentId: string; attachmentId: string }>;
  },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId, componentId, attachmentId } = await params;
  const prisma = await getTenantPrisma();

  // Load attachment — 404 if missing or soft-deleted
  const attachment = await prisma.payComponentAttachment.findFirst({
    where: { id: attachmentId, componentId, deletedAt: null },
  });
  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  // Verify component ownership chain: attachment.componentId → component → assignment → tenant
  const component = await prisma.loadPayComponent.findFirst({
    where: { id: componentId, assignmentId, deletedAt: null },
  });
  if (!component) {
    return NextResponse.json({ error: 'Component not found.' }, { status: 404 });
  }

  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // Driver must be assigned to this load; otherwise 404 (per spec — not 403)
  const role: string = session.role;
  const isDriver = role === 'driver' || role === 'DRIVER';
  if (isDriver && assignment.driverId !== session.userId) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  // Generate short-lived download URL (15 min, inline content disposition)
  const url = await getAttachmentDownloadUrl(attachment.storageKey);

  return NextResponse.json(
    { url, expiresIn: 900 },
    {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    },
  );
}
