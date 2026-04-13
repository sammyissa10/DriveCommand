import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getCarrierDriver, updateCarrierDriver } from '@/lib/carrier/fleet-drivers';

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
  payModel: z.enum(['per_mile', 'percentage', 'flat_rate', 'per_stop']).optional(),
  payRate: z.number().optional(),
  payPeriod: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
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
    const driver = await getCarrierDriver(orgId, id);
    if (!driver) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: driver });
  } catch (err) {
    logger.error('GET /api/v1/carrier/fleet/drivers/[id] failed', err);
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
    logger.error('PATCH /api/v1/carrier/fleet/drivers/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
