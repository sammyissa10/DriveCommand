import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { authLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

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
    // Rate limit by IP: 5 attempts per 15 minutes
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
    const limited = await applyRateLimit(authLimiter, ip);
    if (limited) return limited;

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

    // Security claims: read from app_metadata (admin-only, tamper-proof)
    const appMeta = data.user.app_metadata || {};
    // Display fields: read from user_metadata (user-editable, display only)
    const userMeta = data.user.user_metadata || {};
    const name = [userMeta.firstName, userMeta.lastName].filter(Boolean).join(' ') || data.user.email;

    let redirectUrl = '/dashboard';
    if (appMeta.isSystemAdmin) redirectUrl = '/admin-dashboard';
    else if (appMeta.role === 'DRIVER') redirectUrl = '/my-route';

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
        role: appMeta.role,
        tenantId: appMeta.tenantId,
        companyName: appMeta.companyName || '',
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
