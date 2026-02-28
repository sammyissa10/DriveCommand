import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth/session';

/**
 * Next.js proxy (formerly middleware) that resolves tenant context from the
 * session cookie and injects it as a request header for downstream API routes
 * and server actions.
 *
 * Renamed from middleware.ts → proxy.ts per Next.js 16 convention.
 *
 * Flow:
 * 1. Public routes pass through (sign-in, sign-up, auth API, webhooks)
 * 2. Unauthenticated requests on protected routes get redirected to sign-in
 * 3. Authenticated users without tenantId are redirected to /onboarding
 * 4. Authenticated users with tenantId get x-tenant-id header injected
 *
 * Uses Web Crypto API (via session.ts decrypt) which is compatible with Edge Runtime.
 * Cannot use next/headers cookies() in proxy — reads from request directly.
 */

const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/accept-invitation',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/accept-invitation',
  '/api/warmup',
  '/api/webhooks',
  '/track',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/favicon.png',
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
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Read session cookie directly from request (not next/headers)
  const sessionToken = request.cookies.get('session')?.value;
  const session = await decrypt(sessionToken);

  // Unauthenticated on protected route - redirect to sign-in
  if (!session) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect_url', request.url);
    return NextResponse.redirect(signInUrl);
  }

  // User is authenticated but has no tenant assigned
  if (!session.tenantId) {
    const isOnboardingPath = pathname.startsWith('/onboarding');
    const isApiPath = pathname.startsWith('/api');

    if (!isOnboardingPath && !isApiPath) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    return NextResponse.next();
  }

  // Driver guard: redirect DRIVER role away from owner-only paths
  if (session.role === 'DRIVER' && OWNER_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/my-route', request.url));
  }

  // User has tenant - inject tenant ID into request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', session.tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
