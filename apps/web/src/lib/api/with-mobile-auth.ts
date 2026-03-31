/**
 * withMobileAuth — Shared mobile API authentication wrapper.
 *
 * Eliminates duplicated auth boilerplate from every /api/mobile/* route handler.
 * Handles:
 *   1. Bearer token validation (validateMobileToken)
 *   2. Role check against allowedRoles
 *      - For DRIVER routes: also verifies auth.driverId is set
 *   3. Rate limiting (mobileLimiter)
 *   4. Wraps the handler in try/catch with standard error response
 *
 * Usage:
 *   export const GET = withMobileAuth(
 *     async (req, { auth }) => { ... return NextResponse.json(...) },
 *     { allowedRoles: ['DRIVER'] }
 *   )
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateMobileToken,
  unauthorizedResponse,
  type MobileAuthContext,
} from '@/lib/auth/mobile-auth'
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export type MobileAuthOptions = {
  /** Role(s) permitted to call this endpoint. */
  allowedRoles: ('DRIVER' | 'OWNER')[]
}

export type MobileHandlerContext = {
  auth: MobileAuthContext
}

export type AuthenticatedMobileHandler = (
  req: NextRequest,
  context: MobileHandlerContext
) => Promise<NextResponse>

/**
 * Wraps a mobile API handler with authentication, role gating, and rate limiting.
 */
export function withMobileAuth(
  handler: AuthenticatedMobileHandler,
  options: MobileAuthOptions
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    // 1. Validate Bearer token
    const auth = await validateMobileToken(req)
    if (!auth) return unauthorizedResponse()

    // 2. Role check
    if (!options.allowedRoles.includes(auth.role as 'DRIVER' | 'OWNER')) {
      const required = options.allowedRoles.join(' or ')
      return NextResponse.json(
        { error: `Forbidden — ${required.toLowerCase()} role required` },
        { status: 403 }
      )
    }

    // 3. For DRIVER role, ensure driverId is present
    if (auth.role === 'DRIVER' && !auth.driverId) {
      return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 })
    }

    // 4. Rate limiting
    const limited = await applyRateLimit(mobileLimiter, auth.userId)
    if (limited) return limited

    // 5. Delegate to route handler
    try {
      return await handler(req, { auth })
    } catch (err) {
      logger.error('[withMobileAuth] handler error:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
