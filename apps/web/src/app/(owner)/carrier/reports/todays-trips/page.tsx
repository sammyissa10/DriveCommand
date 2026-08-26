import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { TodaysTripsGrid } from './_grid/TodaysTripsGrid';

/**
 * Phase 11 — Today's Trips report (spec Section 13).
 *
 * PERMISSION: this reuses `performanceReport` rather than adding a key.
 * `UserPermissions` is a hand-maintained interface with a sibling metadata list
 * and three separate pickers, and DEC-16 recorded what adding a value to one of
 * those vocabularies actually costs — `PlaybookCategory` spent sixteen months
 * carrying a value no user could pick. This report is a performance report by
 * any reading, the owners who can see one should see the other, and inventing a
 * settings toggle nobody asked for would be a fourth rung.
 */
export default async function TodaysTripsReportPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Today&apos;s Trips</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every trip departing today, plus anything still running from earlier.
          Problems are listed first.
        </p>
      </div>
      <TodaysTripsGrid />
    </div>
  );
}
