import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { completeStep } from '@/server/services/workflows/completeStep'
import { TRPCError } from '@trpc/server'

/**
 * POST /api/mobile/driver/tasks/[id]/complete
 *
 * Body: { result: StepResult }
 *
 * Calls completeStep service which validates type-specific requirements
 * and recomputes dispatch readiness.
 *
 * Requires: Authorization: Bearer <token>
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { userId, tenantId } = auth

    // Extract the step instance ID from the URL path: /api/mobile/driver/tasks/[id]/complete
    const urlParts = req.url.split('/')
    const completeIdx = urlParts.indexOf('complete')
    const stepInstanceId = completeIdx > 0 ? urlParts[completeIdx - 1] : null

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

    try {
      const updated = await completeStep({
        stepInstanceId,
        userId,
        tenantId,
        result: body.result as Parameters<typeof completeStep>[0]['result'],
      })
      return NextResponse.json({ stepInstance: updated })
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
