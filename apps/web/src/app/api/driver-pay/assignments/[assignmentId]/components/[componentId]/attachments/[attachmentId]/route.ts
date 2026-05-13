/**
 * DELETE /api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]
 *   Soft-delete an attachment (sets deletedAt).
 *   Subsequent fetches to this attachment will return 404.
 *
 * Access rules:
 *   - Owner/manager: can delete any attachment on any component in their tenant.
 *   - Driver: can only delete attachments they uploaded (uploadedBy === session.userId).
 *   - All roles: returns 404 (not 403) for missing/already-deleted attachments or cross-tenant guesses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export async function DELETE(
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

  // Load attachment — 404 if missing or already soft-deleted
  const attachment = await prisma.payComponentAttachment.findFirst({
    where: { id: attachmentId, componentId, deletedAt: null },
  });
  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  // Load assignment for PAID guard + driver check
  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // PAID guard
  if ((assignment.payStatus as string) === 'PAID') {
    return NextResponse.json(
      { error: 'Cannot delete attachments from a paid assignment.' },
      { status: 409 },
    );
  }

  const role: string = session.role;
  const isDriver = role === 'driver' || role === 'DRIVER';

  // Drivers can only delete their own uploads
  if (isDriver) {
    if (attachment.uploadedBy !== session.userId) {
      // Return 404 per spec — cross-tenant/cross-user access returns 404 not 403
      return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    }
  }

  // Soft-delete
  // TODO: daily cleanup job removes storage object via deleteAttachmentObject(attachment.storageKey)
  await prisma.payComponentAttachment.update({
    where: { id: attachmentId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
