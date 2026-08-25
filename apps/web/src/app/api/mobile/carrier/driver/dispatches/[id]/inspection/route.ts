import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { logger, serializeError } from '@/lib/logger'
import { handleGetGate } from '@/lib/carrier/inspection-handlers'
import { dispatchIdFromUrl } from '@/lib/carrier/inspection-url'

/**
 * GET /api/mobile/carrier/driver/dispatches/[id]/inspection
 *
 * The Bearer-token mirror of the web gate route. Same handler, same view, so the
 * driver's phone and the owner's browser can never disagree about whether a trip
 * may start.
 */
export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId } = auth
    const dispatchId = dispatchIdFromUrl(req.url, 'inspection')
    if (!dispatchId) {
      return NextResponse.json({ error: 'Missing trip id' }, { status: 400 })
    }

    try {
      const result = await handleGetGate({ orgId: tenantId, dispatchId })
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
      }
      return NextResponse.json(result.data)
    } catch (err) {
      logger.error('[mobile] GET dispatch inspection gate failed', err, {
        tenantId,
        dispatchId,
        error: serializeError(err),
      })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { allowedRoles: ['DRIVER', 'OWNER'] }
)
