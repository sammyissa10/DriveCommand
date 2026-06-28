import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getCarrierTruck, updateCarrierTruck } from '@/lib/carrier/fleet-trucks';

const CarrierTruckUpdateSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  displayName: z.string().nullable().optional(),
  vin: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  truckType: z
    .enum(['semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck'])
    .optional(),
  grossWeightLbs: z.number().int().nullable().optional(),
  payloadCapacityLbs: z.number().int().nullable().optional(),
  currentOdometerMiles: z.number().int().nullable().optional(),
  licensePlate: z.string().nullable().optional(),
  licenseState: z.string().max(2).nullable().optional(),
  registrationExpiry: z.string().nullable().optional(),
  licenseExpiry: z.string().nullable().optional(),
  insuranceExpiry: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'maintenance', 'out_of_service']).optional(),
  notes: z.string().nullable().optional(),
  photoS3Key: z.string().nullable().optional(),
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
    const truck = await getCarrierTruck(orgId, id);
    if (!truck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: truck });
  } catch (err) {
    logger.error('GET /api/v1/carrier/fleet/trucks/[id] failed', err);
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
    const parsed = CarrierTruckUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const truck = await updateCarrierTruck(orgId, id, parsed.data);
    if (!truck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    revalidatePath(`/carrier/fleet/trucks/${id}`);
    revalidatePath('/carrier/fleet/trucks');

    return NextResponse.json({ data: truck });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/fleet/trucks/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
