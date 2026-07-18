import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * POST /api/auth/login
 *
 * Accepts { email, password } JSON body.
 * Authenticates via Supabase Auth (signInWithPassword).
 * Session cookie is set automatically by @supabase/ssr.
 * Returns redirect URL and Supabase access_token for mobile app.
 */
export async function POST(req: NextRequest) {
  let authUserId: string | undefined;
  try {
    // Rate limit by IP: 5 attempts per 15 minutes
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
    const limited = await applyRateLimit(authLimiter, ip);
    if (limited) return limited;

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
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

    authUserId = data.user.id;

    // Security claims: read from app_metadata (admin-only, tamper-proof)
    const appMeta = data.user.app_metadata || {};
    // Display fields: read from user_metadata (user-editable, display only)
    const userMeta = data.user.user_metadata || {};

    // Warn when expected provisioning claims are absent — indicates incomplete setup
    if (!appMeta.isSystemAdmin) {
      if (!appMeta.role) {
        logger.warn('Login: user has no role in app_metadata', { userId: authUserId });
      }
      if (!appMeta.tenantId) {
        logger.warn('Login: user has no tenantId in app_metadata', { userId: authUserId });
      }
    }

    // For non-sysadmin users: verify the tenant row exists and is active, and the user is active
    if (appMeta.tenantId && !appMeta.isSystemAdmin) {
      // Quick-423: set app.current_tenant_id GUC inside a tx before querying Tenant so
      // the tenant_self_read RLS policy can match. Under app_user (Phase 2), the bare
      // findUnique returns null because the GUC is unset — wrapping in a tx with TRUE
      // (transaction-scope) avoids pool-leak while allowing the policy to read the row.
      const tenant = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)`;
        return tx.tenant.findUnique({
          where: { id: appMeta.tenantId as string },
          select: { isActive: true },
        });
      }, TX_OPTIONS);

      if (!tenant) {
        logger.error('Login: tenantId in app_metadata not found in DB', undefined, {
          userId: authUserId,
          tenantId: appMeta.tenantId as string,
        });
        return NextResponse.json(
          { error: 'Account not found. Please contact support.' },
          { status: 403 }
        );
      }

      if (!tenant.isActive) {
        logger.warn('Login: login attempt on suspended tenant', {
          userId: authUserId,
          tenantId: appMeta.tenantId as string,
        });
        // Destroy the session Supabase just created
        try {
          const supabaseAdmin = createAdminClient();
          await supabaseAdmin.auth.admin.signOut(authUserId, 'global');
        } catch (signOutErr) {
          logger.error('[login] Failed to sign out suspended-tenant user:', signOutErr);
        }
        return NextResponse.json(
          { error: 'Your account has been deactivated. Please contact support.' },
          { status: 403 }
        );
      }

      // Verify the user has a local DB record and is active (guards against deactivated users)
      // Quick-424: set GUC inside tx so the user_tenant_rls policy can match under app_user (Phase 2).
      const dbUser = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)`;
        return tx.user.findUnique({
          where: { id: authUserId },
          select: { id: true, isActive: true },
        });
      }, TX_OPTIONS);
      if (!dbUser) {
        logger.error('Login: Supabase auth user has no local DB record', undefined, {
          userId: authUserId,
          tenantId: appMeta.tenantId as string,
        });
        return NextResponse.json(
          { error: 'Account setup incomplete. Please contact support.' },
          { status: 403 }
        );
      }

      if (!dbUser.isActive) {
        logger.warn('Login: login attempt by deactivated user', {
          userId: authUserId,
          tenantId: appMeta.tenantId as string,
        });
        // Destroy the session Supabase just created
        try {
          const supabaseAdmin = createAdminClient();
          await supabaseAdmin.auth.admin.signOut(authUserId, 'global');
        } catch (signOutErr) {
          logger.error('[login] Failed to sign out deactivated user:', signOutErr);
        }
        return NextResponse.json(
          { error: 'Your account has been deactivated. Please contact support.' },
          { status: 403 }
        );
      }
    }

    // For OWNER role: check activation status and redirect to onboarding if not yet activated
    let ownerIsActivated = true; // default to true — only override for OWNER tenants
    if (appMeta.tenantId && appMeta.role === 'OWNER') {
      try {
        const activationRow = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.activationProgress.findUnique({
            where: { tenantId: appMeta.tenantId as string },
            select: { isActivated: true },
          });
        }, TX_OPTIONS);
        // If no row exists (defensive), treat as not-activated
        ownerIsActivated = activationRow?.isActivated ?? false;
      } catch (activationErr) {
        // Non-fatal: if the check fails, fall through to dashboard (better than blocking login)
        logger.warn('[login] ActivationProgress check failed — defaulting to dashboard', {
          tenantId: appMeta.tenantId as string,
          activationErr,
        });
        ownerIsActivated = true;
      }
    }

    const name = [userMeta.firstName, userMeta.lastName].filter(Boolean).join(' ') || data.user.email;

    let redirectUrl = '/carrier/dashboard';
    if (appMeta.isSystemAdmin) redirectUrl = '/admin-dashboard';
    else if (appMeta.role === 'DRIVER') redirectUrl = '/home';
    else if (appMeta.role === 'OWNER' && !ownerIsActivated) redirectUrl = '/onboarding/welcome';

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
    logger.error('Login error', error, {
      userId: authUserId,
      step: 'POST /api/auth/login',
    });
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
