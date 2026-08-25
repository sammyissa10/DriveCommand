import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { logger, serializeError } from '@/lib/logger'
import { handleOpenChecklist } from '@/lib/carrier/inspection-handlers'
import { dispatchIdFromUrl } from '@/lib/carrier/inspection-url'

/**
 * POST /api/mobile/carrier/driver/dispatches/[id]/inspection/checklist
 *
 * Open the full-screen checklist: returns every step grouped into sections, plus
 * the signature step's state. Creates the PlaybookInstance if the tenant has no
 * ON_DISPATCH_CREATE trigger, which is why this is a POST and not a GET.
 *
 * Re-opening is idempotent — an existing instance is returned as-is, with every
 * previous answer intact. That is what makes "go back mid-checklist and your
 * answers are preserved" true across an app kill, not just across a screen pop.
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId, userId } = auth
    const dispatchId = dispatchIdFromUrl(req.url, 'inspection')
    if (!dispatchId) {
      return NextResponse.json({ error: 'Missing trip id' }, { status: 400 })
    }

    try {
      const result = await handleOpenChecklist({ orgId: tenantId, dispatchId, userId })
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
      }
      return NextResponse.json(result.data)
    } catch (err) {
      logger.error('[mobile] POST open inspection checklist failed', err, {
        tenantId,
        dispatchId,
        error: serializeError(err),
      })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { allowedRoles: ['DRIVER'] }
)
