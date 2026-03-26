import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { checkGeofenceAndAlert } from '@/lib/geofencing/geofence-check';
import { gpsLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/gps/report
 *
 * Accepts GPS coordinates from authenticated drivers and writes
 * GPSLocation records. The driver's truckId is resolved from their
 * active route (PLANNED or IN_PROGRESS).
 *
 * Supports dual authentication:
 *   - Mobile app: Authorization: Bearer <token>
 *   - Web app: cookie-based session via getSession()
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate — try mobile Bearer token first, fall back to cookie session
    const mobileAuth = await validateMobileToken(req);
    const session = mobileAuth ?? (await getSession());
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Verify DRIVER role
    if (session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Normalize auth fields — both MobileAuthContext and SessionPayload expose userId/tenantId/role
    const { userId, tenantId } = session;

    // Rate limit by userId: 1 request per 5 seconds per driver
    const gpsLimited = await applyRateLimit(gpsLimiter, userId);
    if (gpsLimited) return gpsLimited;

    // 3. Parse and validate body
    const body = await req.json();
    const { latitude, longitude, speed, heading, altitude, accuracy } = body as {
      latitude?: number;
      longitude?: number;
      speed?: number | null;
      heading?: number | null;
      altitude?: number | null;
      accuracy?: number | null;
    };

    if (
      latitude === undefined ||
      longitude === undefined ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      return NextResponse.json(
        { error: 'latitude and longitude are required numbers' },
        { status: 400 }
      );
    }

    // 4. Validate coordinate ranges
    if (latitude < -90 || latitude > 90) {
      return NextResponse.json(
        { error: 'latitude must be between -90 and 90' },
        { status: 400 }
      );
    }
    if (longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'longitude must be between -180 and 180' },
        { status: 400 }
      );
    }

    // 5. Resolve truckId — check active Load first (mobile), then fall back to Route (web)
    const truckId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const load = await tx.load.findFirst({
        where: {
          driverId: userId,
          tenantId: tenantId,
          status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
          truckId: { not: null },
          archivedAt: null,
        },
        select: { truckId: true },
        orderBy: { pickupDate: 'asc' },
      });
      if (load?.truckId) return load.truckId;

      const route = await tx.route.findFirst({
        where: {
          driverId: userId,
          tenantId: tenantId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        select: { truckId: true },
      });
      return route?.truckId ?? null;
    }, TX_OPTIONS);

    if (!truckId) {
      return NextResponse.json({ error: 'No active load or route' }, { status: 404 });
    }

    // 6. Create GPSLocation record
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.gPSLocation.create({
        data: {
          tenantId: tenantId,
          truckId,
          latitude,
          longitude,
          speed: speed != null ? Math.round(speed) : null,
          heading: heading != null ? Math.round(heading) : null,
          altitude: altitude != null ? Math.round(altitude) : null,
          accuracy: accuracy ?? null,
          timestamp: new Date(),
        },
      });
    }, TX_OPTIONS);

    // 7. Fire geofence check — fire-and-forget, never blocks GPS response
    checkGeofenceAndAlert({
      tenantId: tenantId,
      driverId: userId,
      truckId,
      latitude,
      longitude,
    }).catch((e) => console.error('Geofence check error:', e));

    // 8. Return success
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('GPS report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
