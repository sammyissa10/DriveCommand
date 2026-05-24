import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listTrips, createTrip } from '@/lib/carrier/trips';

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
  // Phase 45 dispatch enforcement — admin override path
  overrideReason: z.string().min(1).optional(),
  overrideForEntityType: z.literal('DRIVER').optional(),
  overrideForEntityId: z.string().uuid().optional(),
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
    const routeTemplateId = searchParams.get('route_template_id') ?? undefined;
    const needsAssignmentRaw = searchParams.get('needs_assignment');
    const needsAssignment =
      needsAssignmentRaw === 'true' ? true : needsAssignmentRaw === 'false' ? false : undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listTrips(orgId, {
      status,
      dateFrom,
      dateTo,
      driverId,
      routeTemplateId,
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

    const dispatch = await createTrip(orgId, {
      ...parsed.data,
      currentUserId: session.userId,
    });
    return NextResponse.json({ data: dispatch }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'DRIVER_NOT_DISPATCH_READY') {
        return NextResponse.json(
          {
            error: 'DRIVER_NOT_DISPATCH_READY',
            message: 'Driver has incomplete required steps. Provide overrideReason to proceed.',
          },
          { status: 409 }
        );
      }
      if (err.message === 'OVERRIDE_REQUIRES_ADMIN') {
        return NextResponse.json({ error: 'OVERRIDE_REQUIRES_ADMIN' }, { status: 403 });
      }
      if (
        err.message === 'Invalid driver' ||
        err.message === 'Invalid truck' ||
        err.message === 'Invalid co-driver'
      ) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }
    logger.error('POST /api/v1/carrier/dispatches failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
