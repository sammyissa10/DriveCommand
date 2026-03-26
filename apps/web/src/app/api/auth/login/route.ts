import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/login
 *
 * Accepts { email, password } JSON body.
 * Authenticates via Supabase Auth (signInWithPassword).
 * Session cookie is set automatically by @supabase/ssr.
 * Returns redirect URL and Supabase access_token for mobile app.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const meta = data.user.user_metadata || {};
    const name = [meta.firstName, meta.lastName].filter(Boolean).join(' ') || data.user.email;

    let redirectUrl = '/dashboard';
    if (meta.isSystemAdmin) redirectUrl = '/admin-dashboard';
    else if (meta.role === 'DRIVER') redirectUrl = '/my-route';

    return NextResponse.json({
      success: true,
      redirectUrl,
      // Mobile app reads these:
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name,
        role: meta.role,
        tenantId: meta.tenantId,
        companyName: meta.companyName || '',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
