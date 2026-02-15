/**
 * Dashboard page - Owner portal landing page
 *
 * This is the post-login destination (NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard).
 * Shows upcoming maintenance and expiring documents.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getUpcomingMaintenance,
  getExpiringDocuments,
} from '@/app/(owner)/actions/notifications';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';
import { ExpiringDocumentsWidget } from '@/components/dashboard/expiring-documents-widget';

export default async function DashboardPage() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Fetch data for both widgets
  const upcomingMaintenance = await getUpcomingMaintenance();
  const expiringDocuments = await getExpiringDocuments();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Fleet overview and alerts</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        <ExpiringDocumentsWidget items={expiringDocuments} />
      </div>
    </div>
  );
}
