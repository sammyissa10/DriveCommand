/**
 * Dashboard page - Owner portal landing page
 *
 * This is the post-login destination (/dashboard).
 * Shows fleet overview stat cards and alert widgets for upcoming maintenance and expiring documents.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getFleetStats } from '@/app/(owner)/actions/dashboard';
import {
  getUpcomingMaintenance,
  getExpiringDocuments,
} from '@/app/(owner)/actions/notifications';
import { StatCard } from '@/components/dashboard/stat-card';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';
import { ExpiringDocumentsWidget } from '@/components/dashboard/expiring-documents-widget';

export default async function DashboardPage() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Fetch all dashboard data in parallel
  const [stats, upcomingMaintenance, expiringDocuments] = await Promise.all([
    getFleetStats(),
    getUpcomingMaintenance(),
    getExpiringDocuments(),
  ]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your fleet at a glance
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Trucks" value={stats.totalTrucks} href="/trucks" />
        <StatCard label="Active Drivers" value={stats.activeDrivers} href="/drivers" />
        <StatCard label="Active Routes" value={stats.activeRoutes} href="/routes" />
        <StatCard
          label="Maintenance Alerts"
          value={stats.maintenanceAlerts}
          href="/trucks"
          variant={stats.maintenanceAlerts > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Alert Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        <ExpiringDocumentsWidget items={expiringDocuments} />
      </div>
    </div>
  );
}
