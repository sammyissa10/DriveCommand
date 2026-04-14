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

    // Ownership check and update in a single transaction to prevent TOCTOU
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.driverPayRecord.findFirst({ where: { id, orgId } });
      if (!record) return { notFound: true } as const;

      if (record.status !== 'pending') {
        return { invalidStatus: true } as const;
      }

      const updated = await tx.driverPayRecord.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: session.userId,
          approvedAt: new Date(),
        },
      });

      return { updated };
    });

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if ('invalidStatus' in result) {
      return NextResponse.json(
        { error: 'Only pending records can be approved' },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: result.updated });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/pay-records/[id]/approve failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
