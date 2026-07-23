import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listCarrierDrivers, createCarrierDriver } from '@/lib/carrier/fleet-drivers';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

const CarrierDriverCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
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
  notes: z.string().optional(),
  sendInvite: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listCarrierDrivers(orgId, { status, search, page, pageSize });
    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/fleet/drivers failed', err);
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
    const parsed = CarrierDriverCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await createCarrierDriver(orgId, parsed.data);
    const carrierDriver = result.driver;

    // Invalidate onboarding welcome cache so activation checklist reflects new driver on back-nav.
    // Must be OUTSIDE after() — Next.js does not guarantee revalidation from inside after().
    revalidatePath('/onboarding/welcome');

    // After response: spawn any ON_DRIVER_CREATE playbooks for this tenant
    // Prefer userId (linked User FK) over CarrierDriver.id as entity identifier per research Pitfall 2
    after(async () => {
      try {
        // after() runs post-response, where request headers() may be unavailable —
        // pass an explicit tenant client rather than relying on header-based getTenantPrisma().
        await fireEvent({
          event: 'ON_DRIVER_CREATE',
          entityData: {
            id: carrierDriver.userId ?? carrierDriver.id,
            email: carrierDriver.email,
          },
          tenantId: orgId, // carrier module uses orgId for tenant scoping
          tenantPrisma: await getTenantPrismaForOrg(orgId),
        });
      } catch (err) {
        logger.error('[carrier/fleet/drivers] fireEvent failed', { driverId: carrierDriver.id, err });
      }
    });

    // Activation tracker: must run BEFORE response so /onboarding/welcome
    // re-renders with fresh data on the next navigation (TKT-0040).
    // Wrapped in try/catch — tracker errors must NEVER fail the create.
    try {
      await recordActivationEvent(orgId, 'first_real_driver');
    } catch (err) {
      logger.error('[carrier/fleet/drivers] activation tracker failed', { driverId: carrierDriver.id, err });
    }

    return NextResponse.json(
      { data: carrierDriver, ...(result.emailWarning ? { warning: result.emailWarning } : {}) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'User already linked to a carrier driver') {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error('POST /api/v1/carrier/fleet/drivers failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
