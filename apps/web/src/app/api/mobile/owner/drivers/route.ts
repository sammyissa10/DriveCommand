import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { prisma, TX_OPTIONS } from '@/lib/db/prisma'
import { computeHOSClocks } from '@/lib/hos/compute-hos-clocks'

/**
 * Compute compliance status from a driver's documents.
 * - CRITICAL (red): any document expired (expiryDate < now)
 * - WARNING (amber): any document expiring within 30 days
 * - OK (green): all documents valid or no expiry date
 */
function computeComplianceStatus(documents: Array<{ expiryDate: Date | null }>): 'ok' | 'warning' | 'critical' {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  let hasWarning = false

  for (const doc of documents) {
    if (!doc.expiryDate) continue
    if (doc.expiryDate < now) return 'critical'
    if (doc.expiryDate < thirtyDaysFromNow) hasWarning = true
  }

  return hasWarning ? 'warning' : 'ok'
}

/**
 * GET /api/mobile/owner/drivers
 *
 * Returns all drivers for the owner's tenant with compliance status.
 * Sorted by name ascending.
 *
 * Returns: Array<{
 *   id, name, email, phone, status,
 *   currentLoadNumber: string | null,
 *   hosStatus: string | null,
 *   complianceStatus: 'ok' | 'warning' | 'critical',
 *   expiringDocCount: number,
 *   expiredDocCount: number,
 * }>
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId } = auth

    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by withMobileAuth() above. tenantId and userId come from the verified JWT.
     */
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const { drivers, invitations } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`

      const drivers = await tx.user.findMany({
        where: { tenantId, role: 'DRIVER', isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          // Current active load — full context for the dispatch subline
          driverLoads: {
            where: {
              status: { in: ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              loadNumber: true,
              status: true,
              origin: true,
              destination: true,
            },
          },
          // Today's HOS entries (plus any still-open overnight entry) — enough
          // to compute the elapsed/remaining clocks via the shared util.
          hosEntries: {
            where: {
              OR: [{ startTime: { gte: startOfDay, lte: endOfDay } }, { endTime: null }],
            },
            orderBy: { startTime: 'asc' },
            select: { status: true, startTime: true, endTime: true },
          },
          // Compliance documents
          driverDocuments: {
            where: { tenantId },
            select: { expiryDate: true },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })

      // Drivers invited but not yet accepted — shown with a neutral "Invited" pill.
      const invitations = await tx.driverInvitation.findMany({
        where: { tenantId, status: 'PENDING' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          email: true,
          createdAt: true,
        },
      })

      return { drivers, invitations }
    }, TX_OPTIONS)

    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const driverRows = drivers.map((driver) => {
      const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver'
      const load = driver.driverLoads[0] ?? null
      const currentLoadNumber = load?.loadNumber ?? null

      // Live active-assignment context for the row subline.
      const activeLoad = load
        ? {
            id: load.id,
            loadNumber: load.loadNumber,
            status: load.status,
            origin: load.origin,
            destination: load.destination,
          }
        : null

      // HOS math done server-side (never in the app's JSX).
      const openEntry = driver.hosEntries.find((e) => e.endTime == null)
      const hosStatus = openEntry?.status ?? null
      const clocks = computeHOSClocks(driver.hosEntries, now)
      const hos = {
        onDutyMinutes: clocks.onDutyMinutesToday,
        driveRemainingMinutes: clocks.driveRemainingMinutes,
        dutyWindowRemainingMinutes: clocks.dutyWindowRemainingMinutes,
        remainingMinutes: clocks.remainingMinutes,
        hasDutyToday: clocks.hasDutyToday,
        isLow: clocks.isLow,
      }

      // Compute compliance counts
      let expiredDocCount = 0
      let expiringDocCount = 0
      for (const doc of driver.driverDocuments) {
        if (!doc.expiryDate) continue
        if (doc.expiryDate < now) expiredDocCount++
        else if (doc.expiryDate < thirtyDaysFromNow) expiringDocCount++
      }

      const complianceStatus = computeComplianceStatus(driver.driverDocuments)

      // Status: on duty if HOS is active OR if driver has an active load
      const status =
        hosStatus === 'DRIVING' || hosStatus === 'ON_DUTY' || currentLoadNumber !== null
          ? 'on_duty'
          : 'off_duty'

      return {
        id: driver.id,
        name,
        email: driver.email,
        phone: null, // User model has no phone field
        status,
        currentLoadNumber,
        activeLoad,
        hosStatus,
        hos,
        complianceStatus,
        expiringDocCount,
        expiredDocCount,
        invited: false as const,
        invitedAt: null,
      }
    })

    const invitedRows = invitations.map((inv) => {
      const name =
        inv.fullName?.trim() ||
        [inv.firstName, inv.lastName].filter(Boolean).join(' ') ||
        inv.email
      return {
        id: inv.id,
        name,
        email: inv.email,
        phone: null,
        status: 'off_duty' as const,
        currentLoadNumber: null,
        activeLoad: null,
        hosStatus: null,
        hos: null,
        complianceStatus: 'ok' as const,
        expiringDocCount: 0,
        expiredDocCount: 0,
        invited: true as const,
        invitedAt: inv.createdAt.toISOString(),
      }
    })

    // Active drivers first (alphabetical), pending invitations after.
    return NextResponse.json([...driverRows, ...invitedRows])
  },
  { allowedRoles: ['OWNER'] }
)
