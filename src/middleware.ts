import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware that resolves tenant context from Clerk session metadata
 * and injects it as a request header for downstream API routes and server actions.
 *
 * Flow:
 * 1. Unauthenticated requests pass through (Clerk handles auth redirects)
 * 2. Authenticated users without tenantId are redirected to /onboarding
 * 3. Authenticated users with tenantId get x-tenant-id header injected
 *
 * CRITICAL: Tenant is resolved from Clerk session metadata, NOT from URL/subdomain.
 */
export async function middleware(request: NextRequest) {
  const { userId, sessionClaims } = await auth();

  // Unauthenticated - let Clerk middleware handle auth redirects
  if (!userId) {
    return NextResponse.next();
  }

  // Extract tenant ID from Clerk private metadata
  const privateMetadata = sessionClaims?.privateMetadata as { tenantId?: string } | undefined;
  const tenantId = privateMetadata?.tenantId;

  // User is authenticated but has no tenant assigned
  // Redirect to onboarding unless already there or on webhook/API routes
  if (!tenantId) {
    const isOnboardingPath = request.nextUrl.pathname.startsWith('/onboarding');
    const isWebhookPath = request.nextUrl.pathname.startsWith('/api/webhooks');
    const isApiPath = request.nextUrl.pathname.startsWith('/api');

    if (!isOnboardingPath && !isWebhookPath && !isApiPath) {
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
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/webhooks/* (webhook handlers need to run before tenant context)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sign-in, sign-up (Clerk auth pages)
     */
    '/((?!api/webhooks|_next/static|_next/image|favicon.ico|sign-in|sign-up).*)',
  ],
};
