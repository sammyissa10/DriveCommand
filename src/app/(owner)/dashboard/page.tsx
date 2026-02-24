/**
 * Dashboard page - Owner portal landing page
 *
 * This is the post-login destination (/dashboard).
 * Shows fleet overview stat cards (including financial metrics) and alert widgets.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getDashboardMetrics, getNotificationAlerts } from '@/app/(owner)/actions/dashboard';
import {
  getUpcomingMaintenance,
  getExpiringDocuments,
} from '@/app/(owner)/actions/notifications';
import { StatCard } from '@/components/dashboard/stat-card';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';
import { ExpiringDocumentsWidget } from '@/components/dashboard/expiring-documents-widget';
import { NotificationsPanel } from '@/components/dashboard/notifications-panel';

export default async function DashboardPage() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Fetch all dashboard data in parallel
  const [metrics, upcomingMaintenance, expiringDocuments, notificationAlerts] = await Promise.all([
    getDashboardMetrics(),
    getUpcomingMaintenance(),
    getExpiringDocuments(),
    getNotificationAlerts(),
  ]);

  // Build overdue subtitle for Unpaid Invoices card (shown in red when overdue > $0)
  const hasOverdue = metrics.overdueTotal !== '$0.00';
  const overdueSubtitle = hasOverdue ? `(${metrics.overdueTotal} overdue)` : undefined;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your fleet at a glance
        </p>
      </div>

      {/* Stat Cards — 6 cards in a responsive 2/3/6-column grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Trucks"
          value={metrics.totalTrucks}
          href="/trucks"
        />
        <StatCard
          label="Active Drivers"
          value={metrics.activeDrivers}
          href="/drivers"
        />
        <StatCard
          label="Active Loads"
          value={metrics.activeLoads}
          href="/loads"
        />
        <StatCard
          label="Maintenance Alerts"
          value={metrics.maintenanceAlerts}
          href="/trucks"
          variant={metrics.maintenanceAlerts > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Unpaid Invoices"
          value={metrics.unpaidTotal}
          href="/invoices"
          variant={hasOverdue ? 'danger' : 'default'}
          subtitle={overdueSubtitle}
        />
        <StatCard
          label="Revenue / Mile"
          value={metrics.revenuePerMile}
          href="/routes"
        />
      </div>

      {/* Bottom section — 3-column grid with notifications, maintenance, and documents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <NotificationsPanel alerts={notificationAlerts} />
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        <ExpiringDocumentsWidget items={expiringDocuments} />
      </div>
    </div>
  );
}
