import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { failInspectionItem } from '@/server/services/workflows/failInspectionItem'
import { TRPCError } from '@trpc/server'

/**
 * POST /api/mobile/driver/tasks/[id]/fail
 *
 * Body: { result: { photoUrls: string[], note?: string } }
 *
 * Calls failInspectionItem service — marks INSPECTION_ITEM as FAILED,
 * creates mechanic APPROVAL step if VEHICLE_INSPECTION category,
 * fires push notifications, and recomputes dispatch readiness.
 *
 * Requires: Authorization: Bearer <token> (DRIVER role)
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { userId, tenantId } = auth

    // Extract step instance ID from URL: /api/mobile/driver/tasks/[id]/fail
    const urlParts = req.url.split('/')
    const failIdx = urlParts.indexOf('fail')
    const stepInstanceId = failIdx > 0 ? urlParts[failIdx - 1] : null

    if (!stepInstanceId) {
      return NextResponse.json({ error: 'Missing step instance ID' }, { status: 400 })
    }

    let body: { result?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body?.result || typeof body.result !== 'object') {
      return NextResponse.json({ error: 'result is required' }, { status: 400 })
    }

    const result = body.result as { photoUrls?: string[]; note?: string }

    try {
      await failInspectionItem({
        stepInstanceId,
        userId,
        tenantId,
        result: {
          photoUrls: Array.isArray(result.photoUrls) ? result.photoUrls : [],
          note: typeof result.note === 'string' ? result.note : undefined,
        },
      })
      return NextResponse.json({ success: true })
    } catch (err) {
      if (err instanceof TRPCError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          BAD_REQUEST: 400,
          FORBIDDEN: 403,
          CONFLICT: 409,
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
