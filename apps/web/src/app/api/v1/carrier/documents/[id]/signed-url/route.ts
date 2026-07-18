import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

const BUCKET = 'drivecommand-files';

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
    const doc = await tenantPrisma.carrierDocument.findFirst({ where: { id } });
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Verify tenant isolation through parent chain
    let orgVerified = false;

    if (doc.parentType === 'stop') {
      const stop = await tenantPrisma.carrierStop.findFirst({
        where: { id: doc.parentId, dispatch: { orgId } },
      });
      orgVerified = !!stop;
    } else if (doc.parentType === 'load') {
      const load = await tenantPrisma.carrierLoad.findFirst({ where: { id: doc.parentId, orgId } });
      orgVerified = !!load;
    } else if (doc.parentType === 'dispatch') {
      const dispatch = await tenantPrisma.trip.findFirst({ where: { id: doc.parentId, orgId } });
      orgVerified = !!dispatch;
    } else if (doc.parentType === 'contract') {
      const contract = await tenantPrisma.carrierContract.findFirst({ where: { id: doc.parentId, orgId } });
      orgVerified = !!contract;
    } else if (doc.parentType === 'client') {
      const client = await tenantPrisma.carrierClient.findFirst({ where: { id: doc.parentId, orgId } });
      orgVerified = !!client;
    } else if (doc.parentType === 'expense') {
      const expense = await tenantPrisma.carrierExpense.findFirst({ where: { id: doc.parentId, orgId } });
      orgVerified = !!expense;
    }

    if (!orgVerified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.fileUrl, 3600);

    if (signedError || !signedData?.signedUrl) {
      logger.error('GET /api/v1/carrier/documents/[id]/signed-url: signed URL generation failed', signedError, { orgId, docId: id });
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: signedData.signedUrl });
  } catch (err) {
    logger.error('GET /api/v1/carrier/documents/[id]/signed-url failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
