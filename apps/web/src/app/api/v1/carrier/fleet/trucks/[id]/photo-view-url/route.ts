import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { generateDownloadUrl } from '@/lib/storage/presigned';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const tenantId = session.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

    const { id } = await params;
    const truck = await prisma.carrierTruck.findFirst({
      where: { id, orgId: tenantId },
      select: { photoS3Key: true },
    });

    if (!truck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!truck.photoS3Key) return NextResponse.json({ error: 'No photo' }, { status: 404 });

    // Tenant isolation: ensure the key belongs to this tenant
    if (!truck.photoS3Key.startsWith(`tenant-${tenantId}/`)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const viewUrl = await generateDownloadUrl(truck.photoS3Key);
    return NextResponse.json({ viewUrl });
  } catch (err) {
    logger.error('[truck photo-view-url] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
