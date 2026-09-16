import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { TX_OPTIONS } from '@/lib/db/prisma'
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context'

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

    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId)
    const stepInstances = await tenantPrisma.$transaction(async (tx) => {
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
