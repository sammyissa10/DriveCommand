import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/owner/fleet-positions
 *
 * Returns the latest GPS position for each active truck in the owner's fleet,
 * joined with driver name and current active load number.
 *
 * Uses DISTINCT ON truckId to return only the most recent GPS ping per truck.
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

  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.$queryRaw<any[]>`
        SELECT DISTINCT ON (gps."truckId")
          gps."truckId",
          gps.latitude,
          gps.longitude,
          gps.speed,
          gps.heading,
          gps.timestamp,
          t.make,
          t.model,
          t."licensePlate",
          u."firstName" AS "driverFirstName",
          u."lastName"  AS "driverLastName",
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

    const positions = rows.map((row) => {
      const firstName = row.driverFirstName ?? '';
      const lastName = row.driverLastName ?? '';
      const driverName =
        firstName || lastName ? `${firstName} ${lastName}`.trim() : null;

      return {
        truckId: row.truckId,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: row.speed !== null ? Number(row.speed) : null,
        heading: row.heading !== null ? Number(row.heading) : null,
        timestamp: row.timestamp,
        truck: {
          make: row.make,
          model: row.model,
          licensePlate: row.licensePlate,
        },
        driverName,
        loadNumber: row.loadNumber ?? null,
      };
    });

    return NextResponse.json(positions);
  } catch (err) {
    console.error('[mobile/owner/fleet-positions] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
