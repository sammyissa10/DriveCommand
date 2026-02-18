import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

/**
 * GET /api/auth/me
 *
 * Returns the current session data (userId, email, role, tenantId, firstName, lastName).
 * Returns 401 if no valid session exists.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    role: session.role,
    tenantId: session.tenantId,
    firstName: session.firstName,
    lastName: session.lastName,
  });
}
