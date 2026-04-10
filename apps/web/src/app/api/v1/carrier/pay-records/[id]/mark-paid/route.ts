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

    if (record.status !== 'approved') {
      let errorMsg: string;
      if (record.status === 'paid') {
        errorMsg = 'Record is already paid';
      } else if (record.status === 'pending') {
        errorMsg = 'Record must be approved before marking as paid';
      } else if (record.status === 'voided') {
        errorMsg = 'Voided records cannot be marked as paid';
      } else {
        errorMsg = 'Only approved records can be marked as paid';
      }
      return NextResponse.json({ error: errorMsg }, { status: 422 });
    }

    const updated = await prisma.driverPayRecord.update({
      where: { id },
      data: {
        status: 'paid',
        ...(!record.approvedAt && {
          approvedBy: session.userId,
          approvedAt: new Date(),
        }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/pay-records/[id]/mark-paid failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
