import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/logout
 *
 * Signs out via Supabase Auth (clears session cookie via @supabase/ssr).
 * Web: redirects to /sign-in.
 * Mobile: returns JSON (mobile uses Bearer tokens, not cookies).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  // Mobile app sends Authorization header — return JSON for API clients
  const isMobile = req.headers.get('authorization')?.startsWith('Bearer ');
  if (isMobile) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.redirect(new URL('/sign-in', req.url));
}
