import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { TX_OPTIONS } from '@/lib/db/prisma'
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context'

/**
 * GET /api/mobile/driver/messages
 *
 * Returns all messages for the authenticated driver's assigned loads,
 * plus any legacy messages the driver sent without a loadId.
 * Ordered by createdAt ascending (oldest first for chat display).
 *
 * Requires: Authorization: Bearer <token>
 */
export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { driverId, tenantId } = auth

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor') ?? undefined
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))

    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId)
    const { messages, nextCursor } = await tenantPrisma.$transaction(async (tx) => {
      // Find all loads assigned to this driver
      const driverLoads = await tx.load.findMany({
        where: { driverId, tenantId },
        select: { id: true },
      })

      const loadIds = driverLoads.map((l) => l.id)

      // Return messages scoped to the driver's loads, plus legacy unscoped messages from this driver
      // Cursor-based pagination ordered desc (newest first), then reverse for chat display
      const rawMessages = await tx.fleetMessage.findMany({
        where: {
          tenantId,
          OR: [
            { loadId: { in: loadIds } },
            { loadId: null, senderId: driverId },
          ],
        },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      })

      let resolvedCursor: string | null = null
      if (rawMessages.length > limit) {
        rawMessages.pop()
        resolvedCursor = rawMessages[rawMessages.length - 1]?.id ?? null
      }

      // Reverse so oldest-first for chat display
      return { messages: rawMessages.reverse(), nextCursor: resolvedCursor }
    }, TX_OPTIONS)

    return NextResponse.json({ messages, nextCursor })
  },
  { allowedRoles: ['DRIVER'] }
)

/**
 * POST /api/mobile/driver/messages
 *
 * Creates a new message from the authenticated driver.
 * Body: { body: string; loadId?: string }
 *
 * Requires: Authorization: Bearer <token>
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId } = auth
    // withMobileAuth guarantees driverId is set for DRIVER role
    const driverId = auth.driverId as string

    let payload: { body?: unknown; loadId?: unknown }
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { body, loadId } = payload

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    // Validate loadId type if provided
    const resolvedLoadId = loadId && typeof loadId === 'string' ? loadId : null

    // quick-617: tenant-scoped client — see the first handler in this file.
    const tenantPrisma = await getTenantPrismaForOrg(tenantId)
    const message = await tenantPrisma.$transaction(async (tx) => {
      // If loadId is provided, verify the load exists and is assigned to this driver
      if (resolvedLoadId) {
        const load = await tx.load.findFirst({
          where: { id: resolvedLoadId, driverId },
        })
        if (!load) {
          return null
        }
      }

      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: driverId,
          senderRole: 'DRIVER',
          body: body.trim(),
          loadId: resolvedLoadId,
        },
      })
    }, TX_OPTIONS)

    if (!message) {
      return NextResponse.json({ error: 'Load not found or not assigned to you' }, { status: 403 })
    }

    return NextResponse.json(message, { status: 201 })
  },
  { allowedRoles: ['DRIVER'] }
)
