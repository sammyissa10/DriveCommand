import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth/session';

/**
 * Next.js middleware that resolves tenant context from the session cookie
 * and injects it as a request header for downstream API routes and server actions.
 *
 * Flow:
 * 1. Public routes pass through (sign-in, sign-up, auth API, webhooks)
 * 2. Unauthenticated requests on protected routes get redirected to sign-in
 * 3. Authenticated users without tenantId are redirected to /onboarding
 * 4. Authenticated users with tenantId get x-tenant-id header injected
 *
 * NOTE: Cannot use next/headers cookies() in middleware — must read from request directly.
 */

const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhooks',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/favicon.png',
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

  // Read session cookie directly from request (not next/headers)
  const sessionToken = request.cookies.get('session')?.value;
  const session = decrypt(sessionToken);

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
