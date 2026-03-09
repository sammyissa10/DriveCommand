import { NextResponse } from 'next/server';
import { setAdminSession } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

/**
 * POST /api/admin/login
 *
 * Verifies the submitted password against ADMIN_SECRET_KEY env var.
 * On success: creates an admin_session cookie (8-hour expiry) and returns 200.
 * On failure: returns 401 with a 500ms delay to slow brute-force attempts.
 */
export async function POST(request: Request) {
  const adminKey = process.env.ADMIN_SECRET_KEY;
  if (!adminKey || adminKey.length < 32) {
    return NextResponse.json({ error: 'Admin auth not configured' }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { password } = body;

  if (password !== adminKey) {
    // Add delay to slow brute-force attempts
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  await setAdminSession();
  return NextResponse.json({ success: true }, { status: 200 });
}
