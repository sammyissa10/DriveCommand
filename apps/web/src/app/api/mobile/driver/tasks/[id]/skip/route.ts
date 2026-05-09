import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { skipStep } from '@/server/services/workflows/skipStep'
import { TRPCError } from '@trpc/server'

/**
 * POST /api/mobile/driver/tasks/[id]/skip
 *
 * Body: { reason: string }
 *
 * Calls skipStep service which marks the step as SKIPPED and recomputes
 * dispatch readiness for the parent instance.
 *
 * Requires: Authorization: Bearer <token>
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { userId, tenantId } = auth

    // Extract the step instance ID from the URL path: /api/mobile/driver/tasks/[id]/skip
    const urlParts = req.url.split('/')
    const skipIdx = urlParts.indexOf('skip')
    const stepInstanceId = skipIdx > 0 ? urlParts[skipIdx - 1] : null

    if (!stepInstanceId) {
      return NextResponse.json({ error: 'Missing step instance ID' }, { status: 400 })
    }

    let body: { reason?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body?.reason || typeof body.reason !== 'string' || body.reason.trim() === '') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    try {
      const updated = await skipStep({
        stepInstanceId,
        userId,
        tenantId,
        reason: body.reason.trim(),
      })
      return NextResponse.json({ stepInstance: updated })
    } catch (err) {
      if (err instanceof TRPCError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          BAD_REQUEST: 400,
          FORBIDDEN: 403,
        }
        return NextResponse.json(
          { error: err.message },
          { status: statusMap[err.code] ?? 500 }
        )
      }
      throw err
    }
  },
  { allowedRoles: ['DRIVER'] }
)
