import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/carrier/live-map/trips?page=1&pageSize=25
 *
 * Returns paginated list of completed routes with driver and truck info.
 * Used by the Trips tab of the live map to display historical route records.
 * Clicking a trip navigates to the History tab to view its GPS trail.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const orgId = session.tenantId;
    if (!orgId) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10) || 25)
    );

    const db = await getTenantPrisma();

    const [routes, total] = await Promise.all([
      db.route.findMany({
        where: {
          tenantId: orgId,
          status: 'COMPLETED',
          archivedAt: null,
        },
        orderBy: { completedAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
        select: {
          id: true,
          name: true,
          origin: true,
          destination: true,
          scheduledDate: true,
          completedAt: true,
          distanceMiles: true,
          driver: {
            select: { firstName: true, lastName: true },
          },
          truck: {
            select: { id: true, make: true, model: true, licensePlate: true },
          },
        },
      }),
      db.route.count({
        where: {
          tenantId: orgId,
          status: 'COMPLETED',
          archivedAt: null,
        },
      }),
    ]);

    const trips = routes.map((r) => ({
      id: r.id,
      name: r.name,
      origin: r.origin,
      destination: r.destination,
      scheduledDate: r.scheduledDate,
      completedAt: r.completedAt,
      distanceMiles: r.distanceMiles,
      driver: r.driver
        ? { name: `${r.driver.firstName} ${r.driver.lastName}` }
        : null,
      truck: r.truck
        ? {
            id: r.truck.id,
            make: r.truck.make,
            model: r.truck.model,
            licensePlate: r.truck.licensePlate,
          }
        : null,
    }));

    return NextResponse.json({ data: { trips, total, page, pageSize } });
  } catch (error) {
    logger.error('Live map trips error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
