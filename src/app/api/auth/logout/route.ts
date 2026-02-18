import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/session';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and returns success.
 */
export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}
