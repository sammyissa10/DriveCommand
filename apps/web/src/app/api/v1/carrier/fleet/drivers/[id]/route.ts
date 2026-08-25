import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getCarrierDriver, updateCarrierDriver, deleteCarrierDriver } from '@/lib/carrier/fleet-drivers';
import { FacilityUnavailableError } from '@/lib/carrier/facility-errors';

const CarrierDriverUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  cdlNumber: z.string().optional(),
  cdlState: z.string().max(2).optional(),
  cdlClass: z.string().optional(),
  cdlExpiry: z.string().optional(),
  homeTerminalId: z.string().uuid().optional(),
  payModel: z.enum(['per_mile', 'percentage_gross', 'hourly', 'flat_rate', 'team_split']).optional(),
  payRate: z.number().optional(),
  payPeriod: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  notes: z.string().optional(),
  // Allow promoting a seeded sample record to a real one (TKT-0075). Only ever
  // set to false from the UI — records are never re-flagged as sample.
  isSample: z.boolean().optional(),
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
    const driver = await getCarrierDriver(orgId, id);
    if (!driver) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: driver });
  } catch (err) {
    logger.error('GET /api/v1/carrier/fleet/drivers/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await deleteCarrierDriver(orgId, id);

    if ('error' in result) {
      if (result.error === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    logger.error('DELETE /api/v1/carrier/fleet/drivers/[id] failed', err);
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
    const parsed = CarrierDriverUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const driver = await updateCarrierDriver(orgId, id, parsed.data);
    if (!driver) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    revalidatePath(`/carrier/fleet/drivers/${id}`);
    return NextResponse.json({ data: driver });
  } catch (err) {
    if (err instanceof FacilityUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error('PATCH /api/v1/carrier/fleet/drivers/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
