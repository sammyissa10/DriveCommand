/**
 * GET /api/v1/messages/[id]/audio-url
 *
 * Returns a fresh presigned download URL for the audio file attached to a voice message.
 * Verifies tenant isolation — only messages belonging to the authenticated user's tenant
 * can be accessed.
 *
 * Requires: any authenticated session (OWNER, MANAGER, or DRIVER).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { generateDownloadUrl } from '@/lib/storage/presigned';
import { logger } from '@/lib/logger';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tenantId } = session;
  const { id } = await params;

  try {
    /*
     * quick-620: tenant-scoped client, acquired from the verified session's tenantId.
     * userId is deliberately NOT passed — it would drive the audit-columns extension to
     * start writing createdById on FleetMessage, a behaviour change this routing task
     * declines to make.
     * Every where clause below is unchanged: RLS is the second layer, not a
     * replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const message = await tenantPrisma.$transaction(async (tx) => {
      return tx.fleetMessage.findFirst({
        where: { id, tenantId },
        select: { id: true, audioUrl: true },
      });
    }, TX_OPTIONS);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (!message.audioUrl) {
      return NextResponse.json({ error: 'No audio attached to this message' }, { status: 404 });
    }

    const url = await generateDownloadUrl(message.audioUrl);

    return NextResponse.json({ url });
  } catch (err) {
    logger.error('[api/v1/messages/[id]/audio-url GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
