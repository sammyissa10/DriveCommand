import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listStops, createStop } from '@/lib/carrier/stops';

const StopCreateSchema = z.object({
  dispatchId: z.string().uuid(),
  loadId: z.string().uuid().optional(),
  sequenceOrder: z.number(),
  stopType: z.enum(['pickup', 'delivery', 'fuel_stop', 'layover']),
  facilityId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  appointmentStart: z.string().datetime().optional(),
  appointmentEnd: z.string().datetime().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  commodityDescription: z.string().optional(),
  pieces: z.number().optional(),
  weightLbs: z.number().optional(),
  bolNumber: z.string().optional(),
  podNumber: z.string().optional(),
  sealNumber: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const dispatchId = searchParams.get('dispatch_id') ?? undefined;
    const loadId = searchParams.get('load_id') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listStops(orgId, { dispatchId, loadId, page, pageSize });

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/stops failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const body = await req.json();
    const parsed = StopCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const stop = await createStop(orgId, parsed.data);
    if (!stop) {
      return NextResponse.json({ error: 'Dispatch or facility not found' }, { status: 404 });
    }

    return NextResponse.json({ data: stop }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/stops failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
