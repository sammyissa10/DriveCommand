/**
 * Dashboard page - Owner portal landing page
 *
 * Uses React Suspense streaming so the header renders instantly and each
 * data section streams in independently as its DB query resolves.
 * No single Promise.all blocks the full page render.
 */

import { Suspense } from 'react';
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

// ─── Async data sections (each runs independently inside Suspense) ────────────

async function StatCardsSection() {
  const metrics = await getDashboardMetrics().catch((e) => {
    console.error('[dashboard] getDashboardMetrics failed:', e);
    return null;
  });

  const m = metrics ?? {
    totalTrucks: 0, activeDrivers: 0, activeRoutes: 0, maintenanceAlerts: 0,
    activeLoads: 0, unpaidTotal: '$0.00', overdueTotal: '$0.00', revenuePerMile: 'N/A',
  };

  const hasOverdue = m.overdueTotal !== '$0.00';
  const overdueSubtitle = hasOverdue ? `(${m.overdueTotal} overdue)` : undefined;

  return (
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
  );
}

async function NotificationsPanelSection() {
  const alerts = await getNotificationAlerts().catch((e) => {
    console.error('[dashboard] getNotificationAlerts failed:', e);
    return [];
  });
  return <NotificationsPanel alerts={alerts} />;
}

async function MaintenanceSection() {
  const items = await getUpcomingMaintenance().catch((e) => {
    console.error('[dashboard] getUpcomingMaintenance failed:', e);
    return [];
  });
  return <UpcomingMaintenanceWidget items={items} />;
}

async function DocumentsSection() {
  const items = await getExpiringDocuments().catch((e) => {
    console.error('[dashboard] getExpiringDocuments failed:', e);
    return [];
  });
  return <ExpiringDocumentsWidget items={items} />;
}

// ─── Skeleton fallbacks ───────────────────────────────────────────────────────

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-3">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-8 w-14 rounded bg-muted" />
            </div>
            <div className="ml-4 h-12 w-12 flex-shrink-0 rounded-xl bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted" />
          <div className="h-5 w-32 rounded bg-muted" />
        </div>
        <div className="h-6 w-8 rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 w-full rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Current date has no DB dependency — renders immediately
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Page Header — no data dependency, renders instantly */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{currentDate}</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
      </div>

      {/* Stat Cards — streams in as getDashboardMetrics resolves */}
      <Suspense fallback={<StatCardsSkeleton />}>
        <StatCardsSection />
      </Suspense>

      {/* Bottom widgets — each streams in independently */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Suspense fallback={<PanelSkeleton />}>
          <NotificationsPanelSection />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <MaintenanceSection />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <DocumentsSection />
        </Suspense>
      </div>
    </div>
  );
}
