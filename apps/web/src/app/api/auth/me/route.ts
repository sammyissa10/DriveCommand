import { NextRequest, NextResponse } from 'next/server';
import { getSession, decrypt } from '@/lib/auth/session';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/auth/me
 *
 * Returns the current user data.
 * Accepts either:
 *   - Cookie-based session (web app)
 *   - Authorization: Bearer <token> header (mobile app)
 *
 * Returns 401 if no valid session exists.
 */
export async function GET(req: NextRequest) {
  // Check Authorization header first (mobile Bearer token), then fall back to cookie
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let session = bearerToken ? await decrypt(bearerToken) : await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // For mobile: fetch fresh user + company name from DB to keep data current
  if (bearerToken) {
    try {
      const user = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findUnique({
          where: { id: session!.userId },
          include: { tenant: { select: { name: true } } },
        });
      }, TX_OPTIONS);

      if (!user || !user.isActive) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      return NextResponse.json({
        id: user.id,
        email: user.email,
        name,
        role: user.role,
        tenantId: user.tenantId,
        companyName: user.tenant.name,
      });
    } catch {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    role: session.role,
    tenantId: session.tenantId,
    firstName: session.firstName,
    lastName: session.lastName,
    permissions: session.permissions,
  });
}
