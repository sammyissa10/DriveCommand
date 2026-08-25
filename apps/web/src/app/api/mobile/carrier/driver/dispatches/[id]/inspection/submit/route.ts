import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { logger, serializeError } from '@/lib/logger'
import { handleSubmitInspection } from '@/lib/carrier/inspection-handlers'
import { dispatchIdFromUrl } from '@/lib/carrier/inspection-url'

/**
 * POST /api/mobile/carrier/driver/dispatches/[id]/inspection/submit
 *
 * Called when the driver signs. Applies the verdict's side effects — defects
 * against the truck, dispatch notified on a critical failure — and returns the
 * gate view the app routes on.
 *
 * It does NOT start the trip. Finishing a walkaround at 04:50 should not put a
 * driver on the road at 04:50; starting stays a separate, explicit tap.
 *
 * Every individual item answer (pass / fail / N-A) has already been written by
 * the EXISTING task endpoints as the driver worked — `/tasks/[id]/complete`,
 * `/fail` and `/skip`. Nothing is held in memory until this call, which is what
 * makes the offline story work: each answer is its own small JSON mutation.
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId, userId } = auth
    const dispatchId = dispatchIdFromUrl(req.url, 'inspection')
    if (!dispatchId) {
      return NextResponse.json({ error: 'Missing trip id' }, { status: 400 })
    }

    try {
      const result = await handleSubmitInspection({ orgId: tenantId, dispatchId, userId })
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
      }
      return NextResponse.json(result.data)
    } catch (err) {
      logger.error('[mobile] POST submit inspection failed', err, {
        tenantId,
        dispatchId,
        error: serializeError(err),
      })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { allowedRoles: ['DRIVER'] }
)
