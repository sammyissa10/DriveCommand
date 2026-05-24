import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { gpsLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/driver/gps-ping
 *
 * Accepts GPS coordinates from web driver portal via browser geolocation API.
 * Uses cookie-based session auth (web only — no Bearer token needed).
 *
 * When the driver has an active CarrierDispatch, resolves the carrierTruckId
 * and persists a GPSLocation row with that FK set (truckId null).
 * Legacy Truck-based GPS pings are unaffected (truckId-based path unchanged).
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate via cookie session
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Verify DRIVER role
    if (session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, tenantId } = session;

    // 3. Rate limit by userId: 1 request per 5 seconds per driver
    const gpsLimited = await applyRateLimit(gpsLimiter, userId);
    if (gpsLimited) return gpsLimited;

    // 4. Parse and validate body
    const body = await req.json();
    const { lat, lng, accuracy, dispatchId, calculatedSpeed } = body as {
      lat?: number;
      lng?: number;
      accuracy?: number | null;
      dispatchId?: string | null;
      calculatedSpeed?: number | null;
    };

    if (lat === undefined || lng === undefined || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
    }

    if (lat < -90 || lat > 90) {
      return NextResponse.json({ error: 'lat must be between -90 and 90' }, { status: 400 });
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'lng must be between -180 and 180' }, { status: 400 });
    }

    // 5. Look up active CarrierDispatch for this driver to get truckId context
    /**
     * @bypass_rls reason: driver-api
     * WHY: Web cookie-based session auth does not establish RLS context automatically.
     *      CarrierTruck/CarrierDispatch tables require bypass_rls for server-side reads.
     * SCOPE: Reads only dispatches where carrierDriver.userId = session.userId AND orgId = session.tenantId.
     * SAFETY: Gated by getSession() + role check above.
     */
    let carrierTruckId: string | null = null;
    try {
      carrierTruckId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

        const carrierDriver = await tx.carrierDriver.findFirst({
          where: { userId, orgId: tenantId },
        });
        if (!carrierDriver) return null;

        const activeDispatch = await tx.trip.findFirst({
          where: {
            primaryDriverId: carrierDriver.id,
            orgId: tenantId,
            status: { in: ['planned', 'in_progress'] },
          },
          select: { truckId: true },
        });

        return activeDispatch?.truckId ?? null;
      }, TX_OPTIONS);
    } catch {
      // Non-fatal — we still log and return success even without truckId
    }

    // 6. Persist GPS coordinates to GPSLocation when carrierTruckId is resolved
    if (carrierTruckId) {
      await prisma.gPSLocation.create({
        data: {
          tenantId,
          carrierTruckId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          speed: calculatedSpeed != null ? Math.round(calculatedSpeed) : null,
          timestamp: new Date(),
        },
      });
    }

    logger.info('driver-gps-ping', {
      driverId: userId,
      lat,
      lng,
      accuracy,
      calculatedSpeed,
      dispatchId,
      carrierTruckId,
      orgId: tenantId,
      source: 'web_driver_portal',
      persisted: !!carrierTruckId,
    });

    return NextResponse.json({ saved: true, source: 'web_driver_portal' });
  } catch (error) {
    logger.error('POST /api/driver/gps-ping: failed', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
