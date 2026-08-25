import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listLoads, createLoad } from '@/lib/carrier/loads';
import { RATE_TYPES } from '@/lib/carrier/rate-types';
import { FacilityUnavailableError } from '@/lib/carrier/facility-errors';

const StopInputSchema = z.object({
  id: z.string().uuid().optional(),
  facility_id: z.string().uuid(),
  stop_type: z.enum(['pickup', 'delivery', 'fuel_stop', 'layover']),
  sequence_order: z.number().int(),
  contact_name: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  commodity_description: z.string().nullable().optional(),
  pieces: z.number().int().nullable().optional(),
  weight_lbs: z.number().nullable().optional(),
  bol_required: z.boolean().optional(),
  pod_required: z.boolean().optional(),
  special_instructions: z.string().nullable().optional(),
  appointment_start: z.string().nullable().optional(),
  appointment_end: z.string().nullable().optional(),
});

const LoadCreateSchema = z.object({
  clientId: z.string().uuid(),
  dispatchId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  loadType: z.enum(['ftl', 'ltl', 'partial', 'drayage', 'intermodal', 'expedited']).optional(),
  referenceNumber: z.string().optional(),
  bolNumber: z.string().optional(),
  proNumber: z.string().optional(),
  poNumber: z.string().optional(),
  commodityDescription: z.string().optional(),
  commodityWeightLbs: z.number().optional(),
  commodityPieces: z.number().int().optional(),
  commodityPallets: z.number().int().optional(),
  hazmat: z.boolean().optional(),
  hazmatClass: z.string().optional(),
  rateType: z.enum(RATE_TYPES).optional(),
  rateAmount: z.number().optional(),
  plannedMiles: z.number().int().positive().optional(),
  brokerFlag: z.boolean().optional(),
  carrierCost: z.number().optional(),
  otherCharges: z.number().optional(),
  specialInstructions: z.string().optional(),
  notes: z.string().optional(),
  stops: z.array(StopInputSchema).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('client_id') ?? undefined;
    const dispatchId = searchParams.get('dispatch_id') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);
    // TKT-0076. Opt-in and default OFF: this endpoint serves the loads GRID,
    // where samples must stay visible with their pill. Only a picker asks for
    // `exclude_samples=true` — today that is `DispatchLoadsPanel`, which
    // attaches a load to a dispatch.
    const excludeSamples = searchParams.get('exclude_samples') === 'true';

    const result = await listLoads(orgId, {
      clientId,
      dispatchId,
      status,
      dateFrom,
      dateTo,
      page,
      pageSize,
      excludeSamples,
    });

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/loads failed', err);
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

    // CRITICAL: clientId is required — check before Zod to return exact error message
    if (!body.clientId) {
      return NextResponse.json(
        { error: 'client_id is required — every load must be attributed to a client.' },
        { status: 400 }
      );
    }

    const parsed = LoadCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const load = await createLoad(orgId, parsed.data);
    return NextResponse.json({ data: load }, { status: 201 });
  } catch (err) {
    if (err instanceof FacilityUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && (
      err.message === 'Invalid client' ||
      err.message === 'Invalid contract'
    )) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Also catch clientId error thrown from lib (belt-and-suspenders)
    if (
      err instanceof Error &&
      err.message === 'client_id is required — every load must be attributed to a client.'
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error('POST /api/v1/carrier/loads failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
