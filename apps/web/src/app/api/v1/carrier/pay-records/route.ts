import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const driverId = searchParams.get('driver_id') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const payPeriodStart = searchParams.get('pay_period_start') ?? undefined;
    const payPeriodEnd = searchParams.get('pay_period_end') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      orgId,
      ...(driverId ? { driverId } : {}),
      ...(status ? { status } : {}),
      ...(payPeriodStart || payPeriodEnd
        ? {
            payPeriodStart: {
              ...(payPeriodStart ? { gte: new Date(payPeriodStart) } : {}),
              ...(payPeriodEnd ? { lte: new Date(payPeriodEnd) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.driverPayRecord.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: { select: { firstName: true, lastName: true } },
          dispatch: {
            select: { id: true, status: true, scheduledDeparture: true },
          },
        },
      }),
      prisma.driverPayRecord.count({ where }),
    ]);

    return NextResponse.json({ data: { items, total, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/pay-records failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
