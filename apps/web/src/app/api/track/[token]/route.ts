import { NextRequest, NextResponse } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { publicLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * Public tracking API — no authentication required.
 * Returns load status and latest GPS position by tracking token.
 * Does NOT expose financial data (rate, tenantId, customerId, notes).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit by IP to prevent token enumeration attacks
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimited = await applyRateLimit(publicLimiter, ip);
  if (rateLimited) return rateLimited;

  const { token } = await params;

  // Look up load by tracking token — public endpoint, no tenant context.
  // quick-600 (B5) — ROUTE. `lib/db/admin-prisma.ts`, reason:
  // 'public shipment tracking lookup'. The clearest genuine cross-tenant read
  // in the codebase — the tracking token IS the credential.
  const adminDb = await getAdminDb('public shipment tracking lookup');
  const load = await adminDb.load.findUnique({
    where: { trackingToken: token },
    include: {
      truck: {
        select: { id: true, make: true, model: true, licensePlate: true },
      },
      driver: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!load) {
    return NextResponse.json(
      { error: 'Tracking information not found' },
      { status: 404 }
    );
  }

  // Fetch latest GPS position for this truck (if truck is assigned)
  let latestGPS = null;
  if (load.truckId) {
    const gps = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.gPSLocation.findFirst({
        where: { truckId: load.truckId! },
        orderBy: { timestamp: 'desc' },
      });
    }, TX_OPTIONS);
    if (gps) {
      latestGPS = {
        latitude: Number(gps.latitude),
        longitude: Number(gps.longitude),
        speed: gps.speed,
        heading: gps.heading,
        timestamp: gps.timestamp,
      };
    }
  }

  // Return only customer-safe fields — no rate, tenantId, customerId, or financial data
  return NextResponse.json({
    loadNumber: load.loadNumber,
    status: load.status,
    origin: load.origin,
    destination: load.destination,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    truck: load.truck
      ? {
          make: load.truck.make,
          model: load.truck.model,
          licensePlate: load.truck.licensePlate,
        }
      : null,
    driverFirstName: load.driver?.firstName ?? null,
    latestGPS,
  });
}
