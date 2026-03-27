import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { LoadStatus } from '@/generated/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/owner/loads?status=all|active|pending|delivered
 *
 * Returns all loads for the authenticated owner's tenant, filtered by status tab:
 * - all (no filter)
 * - active: DISPATCHED, PICKED_UP, IN_TRANSIT
 * - pending: PENDING
 * - delivered: DELIVERED, INVOICED
 *
 * Returns driver name, customer name, and truck info for card display.
 * Sorted by updatedAt descending.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') ?? 'active';

  let statusFilter: LoadStatus[] | undefined;
  if (statusParam === 'active') {
    statusFilter = [LoadStatus.DISPATCHED, LoadStatus.PICKED_UP, LoadStatus.IN_TRANSIT];
  } else if (statusParam === 'pending') {
    statusFilter = [LoadStatus.PENDING];
  } else if (statusParam === 'delivered') {
    statusFilter = [LoadStatus.DELIVERED, LoadStatus.INVOICED];
  }
  // 'all' → no filter (statusFilter remains undefined)

  try {
    const loads = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.load.findMany({
        where: {
          tenantId,
          ...(statusFilter ? { status: { in: statusFilter } } : {}),
          archivedAt: null,
        },
        include: {
          customer: { select: { id: true, companyName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }, TX_OPTIONS);

    // Normalize driver name from firstName/lastName fields
    const loadsWithDriverName = loads.map((load) => ({
      ...load,
      driver: load.driver
        ? {
            id: load.driver.id,
            name:
              [load.driver.firstName, load.driver.lastName].filter(Boolean).join(' ') ||
              'Unknown Driver',
          }
        : null,
    }));

    return NextResponse.json(loadsWithDriverName);
  } catch (err) {
    console.error('[mobile/owner/loads] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/loads
 *
 * Creates a new load in PENDING status.
 *
 * Body: {
 *   customerId?: string,
 *   customerName?: string,  (used if customerId not provided — matches by name)
 *   origin: string,
 *   destination: string,
 *   pickupDate?: string,    (ISO date string)
 *   rate?: number,
 *   driverId?: string
 * }
 *
 * Returns: { load: Load }
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  let body: {
    customerId?: string;
    customerName?: string;
    origin?: string;
    destination?: string;
    pickupDate?: string;
    rate?: number;
    driverId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { customerId, customerName, origin, destination, pickupDate, rate, driverId } = body;

  if (!origin || !destination) {
    return NextResponse.json(
      { error: 'origin and destination are required' },
      { status: 400 }
    );
  }

  try {
    const load = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Resolve customerId — either provided directly or look up by name
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && customerName) {
        const customer = await tx.customer.findFirst({
          where: { tenantId, companyName: { contains: customerName, mode: 'insensitive' } },
          select: { id: true },
        });
        if (!customer) {
          throw new Error(`Customer "${customerName}" not found`);
        }
        resolvedCustomerId = customer.id;
      }
      if (!resolvedCustomerId) {
        throw new Error('customerId or customerName is required');
      }

      // Validate driverId belongs to tenant if provided
      if (driverId) {
        const driver = await tx.user.findFirst({
          where: { id: driverId, tenantId, role: 'DRIVER', isActive: true },
          select: { id: true },
        });
        if (!driver) {
          throw new Error('Driver not found or not active');
        }
      }

      // Generate load number
      const latestLoad = await tx.load.findFirst({
        where: { tenantId },
        orderBy: { loadNumber: 'desc' },
        select: { loadNumber: true },
      });

      let loadNumber = 'LD-0001';
      if (latestLoad) {
        const match = latestLoad.loadNumber.match(/^LD-(\d+)$/);
        if (match) {
          const nextNum = parseInt(match[1], 10) + 1;
          loadNumber = `LD-${String(nextNum).padStart(4, '0')}`;
        }
      }

      return tx.load.create({
        data: {
          tenantId,
          loadNumber,
          customerId: resolvedCustomerId,
          origin,
          destination,
          pickupDate: pickupDate ? new Date(pickupDate) : new Date(),
          rate: rate ?? 0,
          status: 'PENDING',
          driverId: driverId ?? null,
        },
        include: {
          customer: { select: { id: true, companyName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }, TX_OPTIONS);

    // Normalize driver name
    const normalized = {
      ...load,
      driver: load.driver
        ? {
            id: load.driver.id,
            name:
              [load.driver.firstName, load.driver.lastName].filter(Boolean).join(' ') ||
              'Unknown Driver',
          }
        : null,
    };

    return NextResponse.json({ load: normalized }, { status: 201 });
  } catch (err) {
    console.error('[mobile/owner/loads POST] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
