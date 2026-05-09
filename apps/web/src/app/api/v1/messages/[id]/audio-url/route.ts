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
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
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
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() above; tenantId verified on message lookup.
     */
    const message = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
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
