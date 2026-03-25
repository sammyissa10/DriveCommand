import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/map/vehicles
 *
 * Returns the latest GPS position for each active truck in the owner's fleet,
 * with computed vehicle status (MOVING / IDLE / OFFLINE), driver info, and
 * active load number.
 *
 * Status computation:
 *   OFFLINE — last ping > 10 minutes ago
 *   MOVING  — last ping within 10 min AND speed > 8 km/h (5 mph)
 *   IDLE    — last ping within 10 min AND speed <= 8 km/h
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

  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.$queryRaw<any[]>`
        SELECT DISTINCT ON (gps."truckId")
          gps."truckId"       AS "truckId",
          gps.latitude,
          gps.longitude,
          gps.speed,
          gps.heading,
          gps.timestamp       AS "lastPingAt",
          t.make,
          t.model,
          t."licensePlate",
          u.id                AS "driverId",
          u."firstName"       AS "driverFirstName",
          u."lastName"        AS "driverLastName",
          l."loadNumber"
        FROM "GPSLocation" gps
        INNER JOIN "Truck" t ON gps."truckId" = t.id
        LEFT JOIN "Load" l
          ON  l."truckId"   = t.id
          AND l."tenantId"  = gps."tenantId"
          AND l.status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
          AND l."archivedAt" IS NULL
        LEFT JOIN "User" u ON l."driverId" = u.id
        WHERE gps."tenantId" = ${tenantId}::uuid
        ORDER BY gps."truckId", gps.timestamp DESC
      `;
    }, TX_OPTIONS);

    const now = Date.now();
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const MOVING_SPEED_KMH = 8;

    const vehicles = rows.map((row) => {
      const firstName = row.driverFirstName ?? '';
      const lastName = row.driverLastName ?? '';
      const driverName =
        firstName || lastName ? `${firstName} ${lastName}`.trim() : null;

      const lastPingAt = row.lastPingAt ? new Date(row.lastPingAt) : null;
      const ageMs = lastPingAt ? now - lastPingAt.getTime() : Infinity;
      const speed = row.speed !== null ? Number(row.speed) : 0;

      let status: 'MOVING' | 'IDLE' | 'OFFLINE';
      if (ageMs > TEN_MINUTES_MS) {
        status = 'OFFLINE';
      } else if (speed > MOVING_SPEED_KMH) {
        status = 'MOVING';
      } else {
        status = 'IDLE';
      }

      // Build a friendly truck name from make/model/plate
      const truckName = `${row.make} ${row.model} · ${row.licensePlate}`;

      return {
        truckId: row.truckId,
        truckName,
        driverName,
        driverId: row.driverId ?? null,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed,
        heading: row.heading !== null ? Number(row.heading) : null,
        lastPingAt: lastPingAt ? lastPingAt.toISOString() : null,
        status,
        loadNumber: row.loadNumber ?? null,
      };
    });

    return NextResponse.json({ vehicles });
  } catch (err) {
    console.error('[mobile/owner/map/vehicles] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
