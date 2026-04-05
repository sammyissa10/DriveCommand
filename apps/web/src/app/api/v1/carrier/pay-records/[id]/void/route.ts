import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;

    const record = await prisma.driverPayRecord.findFirst({ where: { id, orgId } });
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (record.status === 'paid') {
      return NextResponse.json(
        { error: 'Paid records cannot be voided' },
        { status: 422 }
      );
    }

    const updated = await prisma.driverPayRecord.update({
      where: { id },
      data: { status: 'voided' },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/pay-records/[id]/void failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
