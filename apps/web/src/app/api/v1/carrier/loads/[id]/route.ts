import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getLoad, updateLoad } from '@/lib/carrier/loads';

const LoadUpdateSchema = z.object({
  clientId: z.string().uuid().optional(),
  dispatchId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().optional(),
  loadType: z.enum(['ftl', 'ltl', 'partial', 'drayage', 'intermodal']).optional(),
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
  rateType: z.enum(['per_mile', 'flat', 'per_stop', 'per_cwt', 'per_pallet', 'hourly']).optional(),
  rateAmount: z.number().optional(),
  plannedMiles: z.number().int().optional(),
  brokerFlag: z.boolean().optional(),
  carrierCost: z.number().optional(),
  otherCharges: z.number().optional(),
  specialInstructions: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced']).optional(),
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
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
