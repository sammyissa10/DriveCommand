import { redirect } from 'next/navigation';

// Prevent static pre-rendering
export const dynamic = 'force-dynamic';

/**
 * Root `/` under the driver route group.
 * app/page.tsx takes precedence for unauthenticated visitors, but authenticated
 * drivers are redirected to /home before reaching this route.
 * This redirect acts as a safety net in case a driver somehow lands here directly.
 */
export default function DriverRootPage() {
  redirect('/home');
}
