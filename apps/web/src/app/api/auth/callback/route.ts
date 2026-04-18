import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/callback
 *
 * Supabase Auth callback handler for email confirmations, OAuth flows, etc.
 * Exchanges the auth code for a session and redirects to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  // Validate that `next` is a relative path — prevents open redirect via
  // external URLs (e.g. ?next=https://evil.com) and protocol-relative
  // bypass (e.g. ?next=//evil.com).
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/carrier/dashboard';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
