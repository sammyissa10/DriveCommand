/**
 * GET /api/mobile/carrier/owner/dispatches/[id]
 *
 * Read-only carrier trip detail for the owner phone.
 *
 * Exists because the duplicate-detection flow has to be able to say "open the
 * existing trip" on mobile as well as on web, and the mobile owner portal had
 * no carrier trip surface at all — its `loads` and `routes` screens belong to
 * the legacy universe, not to `dispatches`.
 *
 * Deliberately minimal and read-only: enough to confirm "yes, this document
 * already became that trip". The real owner boards are Phase 11.
 *
 * `Trip` maps to table `dispatches`; the relation field is `dispatch`; API
 * paths are `/dispatches` (audit B11).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

/** Trip number is stashed in `notes`, same as the web grid reads it. */
function dispatchNumberFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  try {
    const { id } = await params;
    // Tenant-scoped client with the org passed explicitly — a Bearer request
    // has no x-tenant-id header for getTenantPrisma() to read. orgId is also in
    // the where clause, as the carrier siblings do.
    const db = await getTenantPrismaForOrg(auth.tenantId, auth.userId);

    const trip = await db.trip.findFirst({
      where: { id, orgId: auth.tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        notes: true,
        scheduledDeparture: true,
        scheduledArrival: true,
        plannedMiles: true,
        primaryDriver: { select: { firstName: true, lastName: true } },
        truck: { select: { unitNumber: true } },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            id: true,
            sequenceOrder: true,
            stopType: true,
            status: true,
            appointmentStart: true,
            pieces: true,
            facility: { select: { name: true, city: true, state: true } },
          },
        },
      },
    });

    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

    return NextResponse.json({
      data: {
        id: trip.id,
        tripNumber: dispatchNumberFromNotes(trip.notes) ?? `Trip ${trip.id.slice(0, 8).toUpperCase()}`,
        status: trip.status,
        scheduledDeparture: trip.scheduledDeparture?.toISOString() ?? null,
        scheduledArrival: trip.scheduledArrival?.toISOString() ?? null,
        plannedMiles: trip.plannedMiles ?? null,
        driverName: trip.primaryDriver
          ? `${trip.primaryDriver.firstName} ${trip.primaryDriver.lastName}`.trim()
          : null,
        truckUnit: trip.truck?.unitNumber ?? null,
        stops: trip.stops.map((s) => ({
          id: s.id,
          sequenceOrder: s.sequenceOrder,
          stopType: s.stopType,
          status: s.status,
          facilityName: s.facility?.name ?? 'Unknown facility',
          city: s.facility?.city ?? null,
          state: s.facility?.state ?? null,
          appointmentStart: s.appointmentStart?.toISOString() ?? null,
          pieces: s.pieces ?? null,
        })),
      },
    });
  } catch (err) {
    logger.error('GET /api/mobile/carrier/owner/dispatches/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
