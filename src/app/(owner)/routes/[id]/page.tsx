import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getRoute, updateRouteStatus } from '@/app/(owner)/actions/routes';
import { listDocuments } from '@/app/(owner)/actions/documents';
import { listExpenses, listExpenseCategories } from '@/app/(owner)/actions/expenses';
import { listPayments } from '@/app/(owner)/actions/payments';
import { listTemplates } from '@/app/(owner)/actions/expense-templates';
import { getRouteFinancialAnalytics } from '@/app/(owner)/actions/route-analytics';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { RouteDetail } from '@/components/routes/route-detail';
import { RouteStatusActions } from '@/components/routes/route-status-actions';
import { RouteDocumentsSection } from './route-documents-section';
import { RouteExpensesSection } from '@/components/routes/route-expenses-section';
import { RoutePaymentsSection } from '@/components/routes/route-payments-section';
import { RouteFinancialSummary } from '@/components/routes/route-financial-summary';
import { ApplyTemplateButton } from '@/components/routes/apply-template-button';
import { RouteCostPerMile } from '@/components/routes/route-cost-per-mile';
import { ProfitMarginAlert } from '@/components/routes/profit-margin-alert';

interface RouteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RouteDetailPage({
  params,
}: RouteDetailPageProps) {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    notFound();
  }

  // Fetch documents, expenses, payments, categories, templates, and financial analytics
  const [documents, expenses, payments, categories, templates, analytics] =
    await Promise.all([
      listDocuments('route', id),
      listExpenses(id),
      listPayments(id),
      listExpenseCategories(),
      listTemplates(),
      getRouteFinancialAnalytics(id),
    ]);

  // If analytics failed to load, return not found
  if (!analytics) {
    notFound();
  }

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
      <div>
        <Link
          href="/routes"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Routes
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {route.origin} to {route.destination}
          </h1>
          <Link
            href={`/routes/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit Route
          </Link>
        </div>
      </div>

      {/* Route Detail */}
      <RouteDetail
        route={route}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
        statusActions={
          <RouteStatusActions
            routeId={route.id}
            currentStatus={route.status}
            updateStatusAction={updateRouteStatus}
          />
        }
      />

      {/* Profit Margin Alert (only shows if low margin) */}
      <ProfitMarginAlert
        isLowMargin={analytics.financials.isLowMargin}
        marginPercent={analytics.financials.marginPercent}
        threshold={analytics.profitMarginThreshold}
      />

      {/* Financial Summary */}
      <RouteFinancialSummary
        totalExpenses={analytics.financials.totalExpenses}
        totalRevenue={analytics.financials.totalRevenue}
        totalPaidRevenue={analytics.financials.totalPaidRevenue}
        totalPendingRevenue={analytics.financials.totalPendingRevenue}
        profit={analytics.financials.profit}
        marginPercent={analytics.financials.marginPercent}
        isLowMargin={analytics.financials.isLowMargin}
      />

      {/* Cost Per Mile Analysis */}
      <RouteCostPerMile
        costPerMile={analytics.costPerMile.costPerMile}
        miles={analytics.costPerMile.miles}
        fleetAverage={analytics.fleetAverage.costPerMile}
        fleetRouteCount={analytics.fleetAverage.routeCount}
        comparison={analytics.comparison.comparison}
        difference={analytics.comparison.difference}
        differencePercent={analytics.comparison.differencePercent}
      />

      {/* Expenses Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-card-foreground">Expenses</h2>
          <ApplyTemplateButton
            routeId={route.id}
            routeStatus={route.status}
            templates={templates}
          />
        </div>
        <RouteExpensesSection
          routeId={route.id}
          routeStatus={route.status}
          categories={categories}
          initialExpenses={expenses}
        />
      </div>

      {/* Payments Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Payments</h2>
        <RoutePaymentsSection
          routeId={route.id}
          routeStatus={route.status}
          initialPayments={payments}
        />
      </div>

      {/* Files Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Files</h2>
        <RouteDocumentsSection routeId={route.id} initialDocuments={documents} />
      </div>
    </div>
  );
}
