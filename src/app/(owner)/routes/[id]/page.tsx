import { notFound } from 'next/navigation';
import { getRoute } from '@/app/(owner)/actions/routes';
import { listDocuments } from '@/app/(owner)/actions/documents';
import { listExpenses, listExpenseCategories } from '@/app/(owner)/actions/expenses';
import { listPayments } from '@/app/(owner)/actions/payments';
import { listTemplates } from '@/app/(owner)/actions/expense-templates';
import { getRouteFinancialAnalytics } from '@/app/(owner)/actions/route-analytics';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { listDrivers } from '@/app/(owner)/actions/drivers';
import { listTrucks } from '@/app/(owner)/actions/trucks';
import { listDriverRouteJoinsByRoute } from '@/app/(owner)/actions/driver-route-joins';
import { getRouteMessages } from '@/app/(owner)/actions/fleet-messages';
import { RoutePageClient } from './route-page-client';

interface RouteDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function RouteDetailPage({
  params,
  searchParams,
}: RouteDetailPageProps) {
  const { id } = await params;
  const { mode } = await searchParams;
  const isEditMode = mode === 'edit';

  // Run all fetches in parallel — every query only needs `id` from params,
  // so there is no reason to await getRoute() first and then fan out.
  // If the route is missing (null), notFound() is called after the parallel fetch.
  const [
    route,
    documents,
    expenses,
    payments,
    categories,
    templates,
    analytics,
    drivers,
    trucks,
    driverAssignments,
    messages,
  ] = await Promise.all([
    getRoute(id).catch((err: unknown) => {
      console.error('[routes/[id]] getRoute failed:', err);
      return null;
    }),
    listDocuments('route', id).catch((err) => {
      console.error('Failed to load route documents:', err);
      return [] as any[];
    }),
    listExpenses(id).catch((err) => {
      console.error('Failed to load route expenses:', err);
      return [] as any[];
    }),
    listPayments(id).catch((err) => {
      console.error('Failed to load route payments:', err);
      return [] as any[];
    }),
    listExpenseCategories().catch(() => [] as any[]),
    listTemplates().catch(() => [] as any[]),
    getRouteFinancialAnalytics(id).catch((err) => {
      console.error('Failed to load route analytics:', err);
      return null;
    }),
    // Always fetch drivers and trucks — edit mode switches client-side (replaceState),
    // so a conditional server fetch would leave the dropdowns empty when the user
    // clicks "Edit Route" without a ?mode=edit in the initial URL.
    listDrivers().catch((err) => {
      console.error('Failed to load drivers for route edit:', err);
      return [] as any[];
    }),
    listTrucks().catch((err) => {
      console.error('Failed to load trucks for route edit:', err);
      return [] as any[];
    }),
    listDriverRouteJoinsByRoute(id).catch(() => [] as any[]),
    getRouteMessages(id).catch(() => [] as any[]),
  ]);

  if (!route) {
    notFound();
  }

  const safeAnalytics = analytics ?? {
    financials: {
      totalExpenses: '0.00',
      totalRevenue: '0.00',
      totalPaidRevenue: '0.00',
      totalPendingRevenue: '0.00',
      profit: '0.00',
      marginPercent: 0,
      isLowMargin: false,
    },
    costPerMile: { costPerMile: null, miles: null },
    fleetAverage: { costPerMile: null, routeCount: 0 },
    comparison: { comparison: 'unknown' as const, difference: null, differencePercent: null },
    profitMarginThreshold: 10,
  };

  // Format dates in tenant timezone (hardcode UTC for v1)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  return (
    <div className="space-y-6">
      <RoutePageClient
        route={route}
        initialEditMode={isEditMode}
        drivers={drivers}
        trucks={trucks}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
        analytics={safeAnalytics}
        expenses={expenses}
        payments={payments}
        categories={categories}
        templates={templates}
        documents={documents}
        driverAssignments={driverAssignments}
        messages={messages}
      />

      {/* Audit Trail */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Record History</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created by</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {route.createdBy
                ? `${route.createdBy.firstName ?? ''} ${route.createdBy.lastName ?? ''}`.trim() || route.createdBy.email
                : 'System'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(route.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed by</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {route.updatedBy
                ? `${route.updatedBy.firstName ?? ''} ${route.updatedBy.lastName ?? ''}`.trim() || route.updatedBy.email
                : 'System'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(route.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
