import { redirect } from 'next/navigation';
import { getSession, getRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';

/**
 * Driver takeover layout — full screen, no chrome.
 *
 * WHY THIS GROUP EXISTS. Section 12 says "full screen means full screen — not a
 * sheet, not a modal". On web there is no `tabBarStyle: { display: 'none' }` to
 * reach for: `src/app/(driver)/layout.tsx` renders the branded header,
 * `DriverNav`, `DriverBottomNav` and a padded `<main>` around every one of its
 * children, unconditionally. A page cannot opt out of its own layout. The only
 * way to take over the viewport is to be a sibling of that group rather than a
 * child of it — which is what `/track/[token]` and `/onboarding` already do,
 * the two existing chrome-free routes in this app.
 *
 * WHY THE GUARD IS DUPLICATED, AND WHY THAT IS THE POINT. Escaping the chrome
 * also escapes the authentication, because `(driver)/layout.tsx` is where the
 * driver portal's session and role checks live. A new group starts with no
 * guard at all. These eight lines are therefore not boilerplate copied out of
 * habit — they are the entire access control for every route underneath, and
 * omitting them would have published a driver's walkaround, and the trip and
 * truck details on it, to anyone with the URL.
 *
 * They are not the only line of defence, deliberately. `resolveInspectionAccess`
 * runs again inside every page and every server action below, because a layout
 * answers "is this a driver" and cannot answer "is this THEIR trip", and
 * because a server action invoked from a stale tab never re-runs a layout at
 * all. The integration test drives that function against real rows; this file
 * is what stops an anonymous request before it reaches it.
 */
export const dynamic = 'force-dynamic';

export default async function DriverFullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const role = await getRole();
  if (role !== UserRole.DRIVER) {
    redirect('/unauthorized');
  }

  // No header, no nav, no padding. `min-h-dvh` rather than `min-h-screen`
  // because this is used on a handset: `100vh` on mobile Safari and Chrome
  // measures the viewport with the URL bar hidden, so a sticky footer sized to
  // it sits below the fold until the driver scrolls. `dvh` is the size the
  // driver can actually see.
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
