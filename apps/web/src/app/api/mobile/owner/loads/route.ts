import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/loads?status=active|history
 *
 * Returns all loads for the authenticated owner's tenant, filtered by status group:
 * - active (default): PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT
 * - history: DELIVERED, INVOICED, CANCELLED
 *
 * Unlike the driver endpoint, this returns ALL tenant loads (not filtered by driverId).
 * Includes truck, driver, and customer info for card display.
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

  const { tenantId } = auth;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') ?? 'active';

  const activeStatuses = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] as const;
  const historyStatuses = ['DELIVERED', 'INVOICED', 'CANCELLED'] as const;

  const statusFilter =
    statusParam === 'history' ? [...historyStatuses] : [...activeStatuses];

  try {
    const loads = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.load.findMany({
        where: {
          tenantId,
          status: { in: statusFilter },
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
