import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getLoad, updateLoad } from '@/lib/carrier/loads';
import { RATE_TYPES } from '@/lib/carrier/rate-types';

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

const LoadUpdateSchema = z.object({
  clientId: z.string().uuid().optional(),
  dispatchId: z.string().uuid().nullable().optional(),
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
  plannedMiles: z.number().int().optional(),
  brokerFlag: z.boolean().optional(),
  carrierCost: z.number().optional(),
  otherCharges: z.number().optional(),
  specialInstructions: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced']).optional(),
  stops: z.array(StopInputSchema).optional(),
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
    const load = await getLoad(orgId, id);
    if (!load) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: load });
  } catch (err) {
    logger.error('GET /api/v1/carrier/loads/[id] failed', err);
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
    const parsed = LoadUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const load = await updateLoad(orgId, id, parsed.data);
    if (!load) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: load });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/loads/[id] failed', {
      error: err instanceof Error ? err.message : JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
