import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/gps/report
 *
 * Accepts GPS coordinates from authenticated drivers and writes
 * GPSLocation records. The driver's truckId is resolved from their
 * active route (PLANNED or IN_PROGRESS).
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Verify DRIVER role
    if (session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // 5. Look up active route to get truckId (bypass RLS in API route)
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.route.findFirst({
        where: {
          driverId: session.userId,
          tenantId: session.tenantId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        select: { truckId: true },
      });
    });

    if (!route) {
      return NextResponse.json({ error: 'No active route' }, { status: 404 });
    }

    // 6. Create GPSLocation record
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.gPSLocation.create({
        data: {
          tenantId: session.tenantId,
          truckId: route.truckId,
          latitude,
          longitude,
          speed: speed != null ? Math.round(speed) : null,
          heading: heading != null ? Math.round(heading) : null,
          altitude: altitude != null ? Math.round(altitude) : null,
          accuracy: accuracy ?? null,
          timestamp: new Date(),
        },
      });
    });

    // 7. Return success
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('GPS report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
