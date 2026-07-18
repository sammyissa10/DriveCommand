import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;

    const tenantPrisma = await getTenantPrisma();
    // Verify contract belongs to org (tenant isolation)
    const contract = await tenantPrisma.carrierContract.findFirst({ where: { id, orgId } });
    if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const docs = await tenantPrisma.carrierDocument.findMany({
      where: { contractId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        documentTypeRef: { select: { name: true } },
        uploader: { select: { firstName: true, lastName: true } },
        stop: { select: { id: true, stopType: true, sequenceOrder: true } },
        load: { select: { id: true, referenceNumber: true } },
        dispatch: { select: { id: true } },
      },
    });

    const data = docs.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      documentTypeName: d.documentTypeRef?.name ?? null,
      filename: d.filename,
      fileSizeBytes: d.fileSizeBytes,
      uploadedByName: d.uploader
        ? `${d.uploader.firstName ?? ''} ${d.uploader.lastName ?? ''}`.trim()
        : null,
      uploadedAt: d.createdAt.toISOString(),
      verified: d.verified,
      notes: d.notes,
      stopId: d.stopId,
      stopName: d.stop
        ? `Stop ${d.stop.sequenceOrder} (${d.stop.stopType.replace(/_/g, ' ')})`
        : null,
      loadId: d.loadId,
      loadReferenceNumber: d.load?.referenceNumber ?? null,
      dispatchId: d.dispatchId,
      dispatchShortId: d.dispatch ? d.dispatch.id.slice(0, 8) : null,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('GET /api/v1/carrier/contracts/[id]/documents failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
