import { getSession } from '@/lib/auth/supabase';
import { getDriverDashboardData } from '@/app/(driver)/actions/driver-dashboard';
import { DriverDashboard } from '@/components/driver/driver-dashboard';
import { logger } from '@/lib/logger';

// Prevent static pre-rendering — dashboard requires live auth + dispatch data
export const dynamic = 'force-dynamic';

/**
 * Driver dashboard landing page (server component).
 * Fetches all dashboard data server-side and passes to the client dashboard component.
 * Drivers land here after login — no automatic redirect.
 */
export default async function DriverHomePage() {
  const session = await getSession();

  try {
    const data = await getDriverDashboardData();

    return (
      <DriverDashboard
        firstName={session?.firstName}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatch={data.dispatch as any}
        hos={data.hos}
        recentMessages={data.recentMessages}
      />
    );
  } catch (err) {
    logger.error('[DriverHomePage] Failed to load dashboard data:', err);

    return (
      <DriverDashboard
        firstName={session?.firstName}
        dispatch={null}
        hos={null}
        recentMessages={[]}
      />
    );
  }
}
