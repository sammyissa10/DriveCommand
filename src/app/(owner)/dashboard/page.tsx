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

  // Fetch all dashboard data in parallel — individual fallbacks so one failure doesn't crash the page
  const [metrics, upcomingMaintenance, expiringDocuments, notificationAlerts] = await Promise.all([
    getDashboardMetrics().catch((e) => { console.error('[dashboard] getDashboardMetrics failed:', e); return null; }),
    getUpcomingMaintenance().catch((e) => { console.error('[dashboard] getUpcomingMaintenance failed:', e); return []; }),
    getExpiringDocuments().catch((e) => { console.error('[dashboard] getExpiringDocuments failed:', e); return []; }),
    getNotificationAlerts().catch((e) => { console.error('[dashboard] getNotificationAlerts failed:', e); return []; }),
  ]);

  // Safe metrics with fallbacks if getDashboardMetrics failed
  const m = metrics ?? {
    totalTrucks: 0, activeDrivers: 0, activeRoutes: 0, maintenanceAlerts: 0,
    activeLoads: 0, unpaidTotal: '$0.00', overdueTotal: '$0.00', revenuePerMile: 'N/A',
  };

  // Build overdue subtitle for Unpaid Invoices card (shown in red when overdue > $0)
  const hasOverdue = m.overdueTotal !== '$0.00';
  const overdueSubtitle = hasOverdue ? `(${m.overdueTotal} overdue)` : undefined;

  // Fleet health badge — computed from notification alerts
  const criticalCount = notificationAlerts.filter((a) => a.severity === 'critical').length;
  const fleetHealthBadge =
    criticalCount > 0
      ? {
          cls: 'bg-status-danger-bg text-status-danger-foreground',
          label: `${criticalCount} critical alert${criticalCount > 1 ? 's' : ''}`,
        }
      : notificationAlerts.length > 0
        ? {
            cls: 'bg-status-warning-bg text-status-warning-foreground',
            label: `${notificationAlerts.length} active alert${notificationAlerts.length > 1 ? 's' : ''}`,
          }
        : {
            cls: 'bg-status-success-bg text-status-success-foreground',
            label: 'All systems clear',
          };

  // Current date formatted for page header (server-side render)
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{currentDate}</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${fleetHealthBadge.cls}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {fleetHealthBadge.label}
          </span>
        </div>
      </div>

      {/* Stat Cards — 6 cards in a responsive 2/3/6-column grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Trucks" value={m.totalTrucks} href="/trucks" />
        <StatCard label="Active Drivers" value={m.activeDrivers} href="/drivers" />
        <StatCard label="Active Loads" value={m.activeLoads} href="/loads" />
        <StatCard
          label="Maintenance Alerts"
          value={m.maintenanceAlerts}
          href="/trucks"
          variant={m.maintenanceAlerts > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Unpaid Invoices"
          value={m.unpaidTotal}
          href="/invoices"
          variant={hasOverdue ? 'danger' : 'default'}
          subtitle={overdueSubtitle}
        />
        <StatCard label="Revenue / Mile" value={m.revenuePerMile} href="/routes" />
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
