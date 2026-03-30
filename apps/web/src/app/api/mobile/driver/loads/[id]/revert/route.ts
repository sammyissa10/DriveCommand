import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/mobile/driver/loads/[id]/revert
 *
 * Reverts a load's status back one step. Only specific backward transitions
 * are permitted (drivers cannot revert to PENDING — that is owner-only):
 *
 *   PICKED_UP   → DISPATCHED   (revert "En Route" back to "Accepted")
 *   IN_TRANSIT  → PICKED_UP    (revert further back)
 *
 * DISPATCHED → PENDING is intentionally blocked (contact dispatch).
 * All terminal statuses (DELIVERED, INVOICED, CANCELLED) cannot be reverted.
 *
 * No request body — the previous status is deterministic from current status.
 * Response: { success: true, load: updatedLoad }
 *
 * Requires: Authorization: Bearer <token>
 */

/** Maps current DB status → the status to revert to (null = not allowed) */
const REVERT_TRANSITIONS: Record<string, string | null> = {
  DISPATCHED: null,      // Cannot revert to PENDING — contact dispatch
  PICKED_UP: 'DISPATCHED',
  IN_TRANSIT: 'PICKED_UP',
};

export async function PATCH(
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

      const currentStatus = load.status as string;

      // Check if revert is possible from this status
      if (!(currentStatus in REVERT_TRANSITIONS)) {
        return {
          error: `Cannot revert from ${currentStatus}`,
          status: 400,
        };
      }

      const previousStatus = REVERT_TRANSITIONS[currentStatus];

      if (previousStatus === null) {
        return {
          error: 'Cannot revert to Pending. Contact dispatch.',
          status: 400,
        };
      }

      // Update load status
      const updatedLoad = await tx.load.update({
        where: { id },
        data: { status: previousStatus as any },
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
    logger.error('[mobile/driver/loads/[id]/revert] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
