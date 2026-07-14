import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listCarrierTrucks, createCarrierTruck, CarrierTruckConflictError } from '@/lib/carrier/fleet-trucks';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';

const nullableString = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.string().optional()
);

const CarrierTruckCreateSchema = z.object({
  unitNumber: z.string().min(1),
  displayName: nullableString,
  vin: nullableString,
  year: z.number().int().optional(),
  make: nullableString,
  model: nullableString,
  truckType: z
    .preprocess(
      (v) => (v === null || v === '' ? undefined : v),
      z.enum(['semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck']).optional()
    ),
  grossWeightLbs: z.number().int().optional(),
  payloadCapacityLbs: z.number().int().optional(),
  currentOdometerMiles: z.number().int().optional(),
  licensePlate: nullableString,
  licenseState: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.string().max(2).optional()
  ),
  registrationExpiry: nullableString,
  licenseExpiry: nullableString,
  insuranceExpiry: nullableString,
  status: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.enum(['active', 'inactive', 'maintenance', 'out_of_service']).optional()
  ),
  notes: nullableString,
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
    const cleaned = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, v === null ? undefined : v])
    );
    const parsed = CarrierTruckCreateSchema.safeParse(cleaned);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: parsed.error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const carrierTruck = await createCarrierTruck(orgId, parsed.data);

    // Invalidate onboarding welcome cache so activation checklist reflects new truck on back-nav.
    // Must be OUTSIDE after() — Next.js does not guarantee revalidation from inside after().
    if (!carrierTruck.isSample) {
      revalidatePath('/onboarding/welcome');
    }

    // After response: spawn any ON_VEHICLE_CREATE playbooks for this tenant
    after(async () => {
      try {
        await fireEvent({
          event: 'ON_VEHICLE_CREATE',
          entityData: { ...carrierTruck, id: carrierTruck.id },
          tenantId: orgId, // carrier module uses orgId for tenant scoping
        });
      } catch (err) {
        logger.error('[carrier/fleet/trucks] fireEvent failed', { truckId: carrierTruck.id, err });
      }
    });

    // Activation tracker: must run BEFORE response so /onboarding/welcome
    // re-renders with fresh data on the next navigation (TKT-0040).
    // Wrapped in try/catch — tracker errors must NEVER fail the create.
    if (!carrierTruck.isSample) {
      try {
        await recordActivationEvent(orgId, 'first_real_truck');
      } catch (err) {
        logger.error('[carrier/fleet/trucks] activation tracker failed', { truckId: carrierTruck.id, err });
      }
    }

    return NextResponse.json({ data: carrierTruck }, { status: 201 });
  } catch (err) {
    if (err instanceof CarrierTruckConflictError) {
      const message =
        err.field === 'vin'
          ? `This VIN is already on Unit ${err.existingUnitNumber}.`
          : `Unit ${err.existingUnitNumber} already exists.`;
      return NextResponse.json(
        { error: message, field: err.field, existingUnitNumber: err.existingUnitNumber },
        { status: 409 }
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }
    logger.error('POST /api/v1/carrier/fleet/trucks failed', err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
