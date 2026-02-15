import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

/**
 * Next.js middleware that resolves tenant context from Clerk session metadata
 * and injects it as a request header for downstream API routes and server actions.
 *
 * Flow:
 * 1. Public routes pass through (sign-in, sign-up, webhooks)
 * 2. Unauthenticated requests on protected routes get redirected to sign-in
 * 3. Authenticated users without tenantId are redirected to /onboarding
 * 4. Authenticated users with tenantId get x-tenant-id header injected
 *
 * CRITICAL: Tenant is resolved from Clerk session metadata, NOT from URL/subdomain.
 */
export default clerkMiddleware(async (auth, request: NextRequest) => {
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims } = await auth();

  // Unauthenticated on protected route - redirect to sign-in
  if (!userId) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect_url', request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Extract tenant ID from Clerk private metadata
  const privateMetadata = sessionClaims?.privateMetadata as { tenantId?: string } | undefined;
  const tenantId = privateMetadata?.tenantId;

  // User is authenticated but has no tenant assigned
  if (!tenantId) {
    const isOnboardingPath = request.nextUrl.pathname.startsWith('/onboarding');
    const isApiPath = request.nextUrl.pathname.startsWith('/api');

    if (!isOnboardingPath && !isApiPath) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    return NextResponse.next();
  }

  // User has tenant - inject tenant ID into request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

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
