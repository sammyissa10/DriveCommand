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

  const route = await getRoute(id).catch((err: unknown) => {
    console.error('[routes/[id]] getRoute failed:', err);
    return null;
  });

  if (!route) {
    notFound();
  }

  // Fetch documents, expenses, payments, categories, templates, and financial analytics
  const [documents, expenses, payments, categories, templates, analytics] =
    await Promise.all([
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
    ]);

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

  // Always fetch drivers and trucks — edit mode switches client-side (replaceState),
  // so a conditional server fetch would leave the dropdowns empty when the user
  // clicks "Edit Route" without a ?mode=edit in the initial URL.
  const [drivers, trucks] = await Promise.all([
    listDrivers().catch((err) => {
      console.error('Failed to load drivers for route edit:', err);
      return [] as any[];
    }),
    listTrucks().catch((err) => {
      console.error('Failed to load trucks for route edit:', err);
      return [] as any[];
    }),
  ]);

  // Format dates in tenant timezone (hardcode UTC for v1)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  return (
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
    />
  );
}
