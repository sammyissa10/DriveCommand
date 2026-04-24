import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { prisma, TX_OPTIONS } from '@/lib/db/prisma'

/**
 * GET /api/mobile/driver/tasks
 *
 * Returns all open StepInstances assigned to the authenticated driver.
 * Open = status IN (NOT_STARTED, IN_PROGRESS).
 * Ordered by dueDate ASC NULLS LAST, then createdAt ASC.
 *
 * Requires: Authorization: Bearer <token>
 */
export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { userId, tenantId } = auth

    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Returns only StepInstances assigned to the authenticated user within their tenant.
     * SAFETY: Gated by withMobileAuth() above. tenantId and userId come from the verified JWT.
     */
    const stepInstances = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`

      return tx.stepInstance.findMany({
        where: {
          assignedUserId: userId,
          status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
          playbookInstance: { tenantId },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          playbookInstance: {
            select: {
              id: true,
              entityType: true,
              entityId: true,
              playbookSnapshot: true,
            },
          },
        },
      })
    }, TX_OPTIONS)

    return NextResponse.json({ stepInstances })
  },
  { allowedRoles: ['DRIVER'] }
)
