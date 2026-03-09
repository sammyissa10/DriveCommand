import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

/**
 * GET /api/admin/logout
 *
 * Clears the admin_session cookie and redirects to /admin/login.
 */
export async function GET(request: Request) {
  await clearAdminSession();
  const loginUrl = new URL('/admin/login', request.url);
  return NextResponse.redirect(loginUrl);
}
