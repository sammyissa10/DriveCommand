import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { PERMISSION_GATED_PATHS, UserPermissions } from '@/lib/auth/permissions';
import { validateOrigin } from '@/lib/security/csrf';

/**
 * Next.js middleware that resolves tenant context from the Supabase session
 * and injects it as a request header for downstream API routes and server actions.
 *
 * Flow:
 * 1. Public routes pass through (sign-in, sign-up, auth API, webhooks)
 * 2. Unauthenticated requests on protected routes get redirected to sign-in
 * 3. Authenticated users without tenantId are redirected to /onboarding
 * 4. System admins (isSystemAdmin=true) are restricted to admin portal paths
 * 5. Authenticated users with tenantId get x-tenant-id header injected
 */

/**
 * PUBLIC API ROUTES — Intentionally unauthenticated
 *
 * These paths bypass authentication in middleware. Each has a specific reason:
 *
 * Authentication flows (pre-auth by nature):
 *   /sign-in, /sign-up, /accept-invitation — login/registration pages
 *   /api/auth/login — POST login endpoint
 *   /api/auth/logout — POST logout endpoint
 *   /api/auth/accept-invitation — GET/POST invitation acceptance (pre-auth)
 *   /api/auth/callback — Supabase OAuth/email confirmation callback
 *
 * Infrastructure:
 *   /api/warmup — Health check / cold-start warmup (no sensitive data)
 *   /api/webhooks — Inbound webhooks (Stripe, etc.) — verified by signature, not session
 *
 * Public-facing:
 *   /track — Public shipment tracking page (token-gated, not session-gated)
 *
 * Static assets:
 *   /_next/static, /_next/image, /favicon.ico, /favicon.png, /site.webmanifest
 *
 * NOTE: /api/geocoding/autocomplete is NOT listed here — it requires authentication
 * (session or mobile Bearer token) enforced at the route handler level.
 * NOTE: /api/cron/* routes are protected by CRON_SECRET verification in each handler.
 * NOTE: /api/mobile/* routes use Bearer token auth, not middleware session cookies.
 *       Middleware passes them through (line ~91), and each handler calls validateMobileToken().
 */
const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/accept-invitation',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/accept-invitation',
  '/api/auth/callback',
  '/api/warmup',
  '/api/webhooks',
  '/track',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/favicon.png',
  '/site.webmanifest',
];

// Paths that belong to the owner portal — drivers navigating here get redirected to /my-route
const OWNER_PATHS = [
  '/dashboard',
  '/trucks',
  '/drivers',
  '/routes',
  '/loads',
  '/invoices',
  '/payroll',
  '/crm',
  '/settings',
  '/compliance',
  '/ai-documents',
  '/profit-predictor',
  '/lane-analytics',
  '/ifta',
  '/live-map',
  '/fuel',
  '/safety',
  '/tags',
  '/subscription',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // CSRF: validate Origin header on state-changing requests
  // Skip for mobile API routes (Bearer token auth, not cookies) and GPS/webhook routes
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const isMobileRoute = pathname.startsWith('/api/mobile/') || pathname.startsWith('/api/gps/');
    const isWebhookOrCron = pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron/');
    if (!isMobileRoute && !isWebhookOrCron) {
      if (!validateOrigin(request)) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
  }

  // Create Supabase middleware client — also refreshes session cookies
  const { supabase, response } = await createMiddlewareClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated on protected route
  if (!user) {
    // API routes handle their own auth (mobile uses Bearer tokens, not cookies).
    // Pass through so the route handler can validate Authorization header itself.
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect_url', request.url);
    return NextResponse.redirect(signInUrl);
  }

  const meta = user.user_metadata || {};

  // User is authenticated but has no tenant assigned
  // System admins have no tenantId by design — skip onboarding redirect for them
  if (!meta.tenantId && !meta.isSystemAdmin) {
    const isOnboardingPath = pathname.startsWith('/onboarding');
    const isApiPath = pathname.startsWith('/api');

    if (!isOnboardingPath && !isApiPath) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    return response;
  }

  // System admin guard: restrict to admin portal paths only
  const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/unauthorized', '/onboarding', '/api'];
  if (meta.isSystemAdmin) {
    const isAdminPath = ADMIN_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
    if (!isAdminPath) {
      return NextResponse.redirect(new URL('/admin-support', request.url));
    }
  }

  // Driver guard: redirect DRIVER role away from owner-only paths
  if (meta.role === 'DRIVER' && OWNER_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/my-route', request.url));
  }

  // MANAGER permission guard: check granular permissions for gated paths
  if (meta.role === 'MANAGER') {
    const gatedRoute = PERMISSION_GATED_PATHS.find((g) =>
      pathname.startsWith(g.path)
    );
    if (gatedRoute) {
      const permissions = (meta.permissions ?? {}) as UserPermissions;
      if (!permissions[gatedRoute.permission]) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }
  }

  // Inject tenant ID into request headers for downstream consumers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', meta.tenantId);

  // Build final response: preserve Supabase session cookies + inject tenant header
  const finalResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Copy Supabase cookie headers from the middleware response
  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie.name, cookie.value, cookie);
  });

  return finalResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public static assets (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)$).*)',
  ],
};
