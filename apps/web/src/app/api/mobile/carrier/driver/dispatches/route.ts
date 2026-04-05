import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/carrier/driver/dispatches
 *
 * Returns the authenticated carrier driver's active (in_progress) and upcoming
 * (planned) dispatches, ordered by scheduled departure ascending.
 *
 * Requires: Authorization: Bearer <token>
 * Requires: User has a linked CarrierDriver record in the same org.
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'DRIVER') {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Filtered to dispatches where the user is primary or co-driver.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const dispatches = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Look up the CarrierDriver record — validateMobileToken returns User.id,
      // but CarrierDriver uses its own UUID as FK on dispatches.
      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: auth.userId, orgId: auth.tenantId },
      });

      if (!carrierDriver) {
        return null;
      }

      return tx.carrierDispatch.findMany({
        where: {
          orgId: auth.tenantId,
          status: { in: ['planned', 'in_progress'] },
          OR: [
            { primaryDriverId: carrierDriver.id },
            { coDriverId: carrierDriver.id },
          ],
        },
        orderBy: { scheduledDeparture: 'asc' },
        include: {
          truck: { select: { id: true, unitNumber: true } },
          stops: {
            orderBy: { sequenceOrder: 'asc' },
            select: {
              id: true,
              sequenceOrder: true,
              stopType: true,
              status: true,
              appointmentStart: true,
              facility: { select: { name: true, city: true, state: true } },
              documents: { select: { id: true, documentType: true } },
            },
          },
        },
      });
    }, TX_OPTIONS);

    if (dispatches === null) {
      return NextResponse.json({ error: 'No carrier driver profile found' }, { status: 404 });
    }

    const mapped = dispatches.map((dispatch) => ({
      id: dispatch.id,
      dispatchNumber: 'DSP-' + dispatch.id.slice(0, 8).toUpperCase(),
      status: dispatch.status,
      scheduledDeparture: dispatch.scheduledDeparture,
      actualDeparture: dispatch.actualDeparture,
      truck: { unitNumber: dispatch.truck.unitNumber },
      stops: dispatch.stops.map((stop) => {
        const bolUploaded = stop.documents.some((d) => d.documentType === 'bol');
        const podUploaded = stop.documents.some((d) => d.documentType === 'pod');
        return {
          id: stop.id,
          sequenceOrder: stop.sequenceOrder,
          stopType: stop.stopType,
          facilityName: stop.facility.name,
          facilityCity: stop.facility.city ?? null,
          facilityState: stop.facility.state ?? null,
          status: stop.status,
          bolRequired: stop.stopType === 'pickup',
          podRequired: stop.stopType === 'delivery',
          bolUploaded,
          podUploaded,
          appointmentStart: stop.appointmentStart,
        };
      }),
    }));

    return NextResponse.json({ dispatches: mapped });
  } catch (err) {
    logger.error('[mobile/carrier/driver/dispatches] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
