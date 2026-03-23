/**
 * Mobile Bearer token validator.
 *
 * Shared utility used by all /api/mobile/* route handlers.
 * Validates the AES-256-GCM Bearer token issued by /api/auth/login
 * and returns the authenticated user context.
 */

import { NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth/session';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { UserRole } from '../../generated/prisma';

export interface MobileAuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  /** Set when role === 'DRIVER'. Equals the User.id (drivers are Users, no separate Driver model). */
  driverId?: string;
}

/**
 * Validate the Authorization: Bearer <token> header from a mobile request.
 *
 * Returns the authenticated user context or null if the token is missing,
 * invalid, or the user is inactive.
 *
 * Usage:
 *   const auth = await validateMobileToken(req);
 *   if (!auth) return unauthorizedResponse();
 */
export async function validateMobileToken(req: Request): Promise<MobileAuthContext | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  const session = await decrypt(token);
  if (!session) return null;

  try {
    // Verify user is still active in DB (prevents revoked accounts from continuing)
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findUnique({
        where: { id: session.userId },
        select: { id: true, tenantId: true, role: true, isActive: true },
      });
    }, TX_OPTIONS);

    if (!user || !user.isActive) return null;

    const ctx: MobileAuthContext = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    // For DRIVER role, driverId is the same as userId (drivers are User records)
    if (user.role === 'DRIVER') {
      ctx.driverId = user.id;
    }

    return ctx;
  } catch {
    return null;
  }
}

/**
 * Standard 401 Unauthorized response for mobile API routes.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Standard 403 Forbidden response (authenticated but accessing another driver's resource).
 */
export function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
