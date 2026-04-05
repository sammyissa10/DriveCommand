import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listDispatches, createDispatch } from '@/lib/carrier/dispatches';

const DispatchCreateSchema = z.object({
  primaryDriverId: z.string().uuid(),
  truckId: z.string().uuid(),
  coDriverId: z.string().uuid().optional(),
  trailerId: z.string().uuid().optional(),
  dispatcherId: z.string().uuid().optional(),
  routeTemplateId: z.string().uuid().optional(),
  scheduledDeparture: z.string().datetime().optional(),
  scheduledArrival: z.string().datetime().optional(),
  plannedMiles: z.number().optional(),
  hosCycle: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status') ?? undefined;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const driverId = searchParams.get('driver_id') ?? undefined;
    const needsAssignmentRaw = searchParams.get('needs_assignment');
    const needsAssignment =
      needsAssignmentRaw === 'true' ? true : needsAssignmentRaw === 'false' ? false : undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listDispatches(orgId, {
      status,
      dateFrom,
      dateTo,
      driverId,
      needsAssignment,
      page,
      pageSize,
    });

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/dispatches failed', err);
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
    const parsed = DispatchCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const dispatch = await createDispatch(orgId, parsed.data);
    return NextResponse.json({ data: dispatch }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/dispatches failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
