import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getTrip, updateTrip } from '@/lib/carrier/trips';

const DispatchUpdateSchema = z.object({
  primaryDriverId: z.string().uuid().optional(),
  truckId: z.string().uuid().optional(),
  coDriverId: z.string().uuid().nullable().optional(),
  trailerId: z.string().uuid().optional(),
  dispatcherId: z.string().uuid().optional(),
  routeTemplateId: z.string().uuid().optional(),
  scheduledDeparture: z.string().datetime().optional(),
  scheduledArrival: z.string().datetime().optional(),
  plannedMiles: z.number().optional(),
  actualMiles: z.number().optional(),
  hosCycle: z.string().optional(),
  notes: z.string().optional(),
});

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
    const dispatch = await getTrip(orgId, id);
    if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: dispatch });
  } catch (err) {
    logger.error('GET /api/v1/carrier/dispatches/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = DispatchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await updateTrip(orgId, id, parsed.data);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/dispatches/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
