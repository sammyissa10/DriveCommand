import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { LoadStatus } from '@/generated/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/mobile/driver/loads/[id]/status
 *
 * Updates a load's status. Enforces the valid driver-facing status progression:
 *   PENDING → ACCEPTED → EN_ROUTE → DELIVERED
 *
 * Mobile uses driver-friendly labels (ACCEPTED, EN_ROUTE) which map to the DB enum:
 *   ACCEPTED  → DISPATCHED  (driver accepts the dispatch)
 *   EN_ROUTE  → IN_TRANSIT  (driver has started moving)
 *   DELIVERED → DELIVERED   (load delivered, same in both systems)
 *
 * Drivers cannot cancel or invoice — those are owner-only actions.
 *
 * Request body: { status: "ACCEPTED" | "EN_ROUTE" | "DELIVERED" }
 * Response: { success: true, load: updatedLoad }
 *
 * Requires: Authorization: Bearer <token>
 */

/** Driver-facing status labels used in the mobile app */
type DriverStatus = 'ACCEPTED' | 'EN_ROUTE' | 'DELIVERED';

/**
 * Maps driver-facing status label → DB LoadStatus enum value.
 * ACCEPTED = driver acknowledged/accepted the dispatch (DISPATCHED in DB)
 * EN_ROUTE  = driver is en route (IN_TRANSIT in DB)
 */
const DRIVER_STATUS_TO_DB: Record<DriverStatus, LoadStatus> = {
  ACCEPTED: 'DISPATCHED',
  EN_ROUTE: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
};

/**
 * Valid transitions: [currentDbStatus] → [nextDriverStatus → nextDbStatus]
 * Defines what mobile action is allowed from each DB status.
 */
const VALID_TRANSITIONS: Record<string, DriverStatus> = {
  PENDING: 'ACCEPTED',
  DISPATCHED: 'EN_ROUTE',
  IN_TRANSIT: 'DELIVERED',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { id } = await params;
  const { driverId, tenantId } = auth;

  // Parse and validate request body
  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedDriverStatus = body?.status as string | undefined;

  if (!requestedDriverStatus || !['ACCEPTED', 'EN_ROUTE', 'DELIVERED'].includes(requestedDriverStatus)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: ACCEPTED, EN_ROUTE, DELIVERED' },
      { status: 400 }
    );
  }

  const newDriverStatus = requestedDriverStatus as DriverStatus;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Fetch current load
      const load = await tx.load.findUnique({
        where: { id, tenantId },
        select: { id: true, driverId: true, status: true },
      });

      if (!load) return { error: 'Load not found', status: 404 };

      // Security: verify load belongs to authenticated driver
      if (load.driverId !== driverId) return { error: 'Forbidden', status: 403 };

      // Validate status transition
      const allowedNextDriverStatus = VALID_TRANSITIONS[load.status];
      if (allowedNextDriverStatus !== newDriverStatus) {
        return {
          error: `Invalid status transition. From ${load.status}, only ${allowedNextDriverStatus ?? 'no further driver action'} is allowed`,
          status: 400,
        };
      }

      // Map to DB status and update
      // SAFE: tenant ownership and driver assignment verified by findUnique above within this same transaction
      const newDbStatus = DRIVER_STATUS_TO_DB[newDriverStatus];
      const updatedLoad = await tx.load.update({
        where: { id },
        data: { status: newDbStatus },
        include: {
          customer: { select: { id: true, companyName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
        },
      });

      return { load: updatedLoad, status: 200 };
    }, TX_OPTIONS);

    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, load: result.load });
  } catch (err) {
    logger.error('[mobile/driver/loads/[id]/status] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
