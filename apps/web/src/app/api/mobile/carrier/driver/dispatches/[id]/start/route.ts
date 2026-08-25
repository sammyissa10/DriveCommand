import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { logger, serializeError } from '@/lib/logger'
import { handleStartTrip } from '@/lib/carrier/inspection-handlers'
import { dispatchIdFromUrl } from '@/lib/carrier/inspection-url'

/**
 * POST /api/mobile/carrier/driver/dispatches/[id]/start
 *
 * The driver's Start trip, through the same gate as the owner portal's. There
 * was no mobile start endpoint before Phase 9 — the driver dispatch detail
 * screen had no Start button at all — so this is new rather than a widening.
 *
 * A blocked start returns 422 with `code: 'BLOCKED'`, which is what routes the
 * app to the blocked screen instead of a toast the driver can dismiss and
 * misread as "try again".
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId, userId } = auth
    const dispatchId = dispatchIdFromUrl(req.url, 'start')
    if (!dispatchId) {
      return NextResponse.json({ error: 'Missing trip id' }, { status: 400 })
    }

    try {
      const result = await handleStartTrip({ orgId: tenantId, dispatchId, userId })
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
      }
      return NextResponse.json(result.data)
    } catch (err) {
      logger.error('[mobile] POST start trip failed', err, {
        tenantId,
        dispatchId,
        error: serializeError(err),
      })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { allowedRoles: ['DRIVER'] }
)
