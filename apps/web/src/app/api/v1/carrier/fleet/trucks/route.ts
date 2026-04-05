import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listCarrierTrucks, createCarrierTruck } from '@/lib/carrier/fleet-trucks';

const CarrierTruckCreateSchema = z.object({
  unitNumber: z.string().min(1),
  vin: z.string().optional(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  truckType: z
    .enum(['semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck'])
    .optional(),
  grossWeightLbs: z.number().int().optional(),
  payloadCapacityLbs: z.number().int().optional(),
  currentOdometerMiles: z.number().int().optional(),
  licensePlate: z.string().optional(),
  licenseState: z.string().max(2).optional(),
  registrationExpiry: z.string().optional(),
  licenseExpiry: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  status: z.enum(['active', 'inactive', 'maintenance', 'out_of_service']).optional(),
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
    const truckType = searchParams.get('truck_type') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listCarrierTrucks(orgId, { status, truckType, search, page, pageSize });
    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/fleet/trucks failed', err);
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
    const parsed = CarrierTruckCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const truck = await createCarrierTruck(orgId, parsed.data);
    return NextResponse.json({ data: truck }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/fleet/trucks failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
