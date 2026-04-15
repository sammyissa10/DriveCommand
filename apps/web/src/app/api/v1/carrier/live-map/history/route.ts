import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/carrier/live-map/history?truckId=X&date=YYYY-MM-DD
 *
 * Returns GPS trail (ordered array of lat/lng/speed/timestamp points) for a
 * specific truck on a specific date. Used by the History tab of the live map.
 *
 * Tenant isolation: verifies the truck belongs to the session's tenantId before
 * returning any GPS data.
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
    const truckId = searchParams.get('truckId');
    const date = searchParams.get('date');

    // Validate required params
    if (!truckId || !UUID_REGEX.test(truckId)) {
      return NextResponse.json(
        { error: 'truckId is required and must be a valid UUID' },
        { status: 400 }
      );
    }
    if (!date || !DATE_REGEX.test(date)) {
      return NextResponse.json(
        { error: 'date is required and must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const db = await getTenantPrisma();

    // Verify truck belongs to this tenant
    const truck = await db.truck.findFirst({
      where: { id: truckId, tenantId: orgId },
      select: { id: true },
    });
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    // Fetch GPS points for truck on that UTC day
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const rawPoints = await db.gPSLocation.findMany({
      where: {
        truckId,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        heading: true,
        timestamp: true,
      },
    });

    // Convert Decimal lat/lng to Number
    const points = rawPoints.map((p: { latitude: unknown; longitude: unknown; speed: number | null; heading: number | null; timestamp: Date }) => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      speed: p.speed,
      heading: p.heading,
      timestamp: p.timestamp,
    }));

    return NextResponse.json({ data: { truckId, date, points } });
  } catch (error) {
    logger.error('Live map history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
