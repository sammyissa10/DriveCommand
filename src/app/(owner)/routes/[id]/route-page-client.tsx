'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, Package } from 'lucide-react';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteDetail } from '@/components/routes/route-detail';
import { RouteStatusActions } from '@/components/routes/route-status-actions';
import { RouteEditSection } from '@/components/routes/route-edit-section';
import { RouteExpensesSection } from '@/components/routes/route-expenses-section';
import { RoutePaymentsSection } from '@/components/routes/route-payments-section';
import { RouteFinancialSummary } from '@/components/routes/route-financial-summary';
import { RouteCostPerMile } from '@/components/routes/route-cost-per-mile';
import { ProfitMarginAlert } from '@/components/routes/profit-margin-alert';
import { ApplyTemplateButton } from '@/components/routes/apply-template-button';
import { RouteDocumentsSection } from './route-documents-section';
import { DriverAssignmentsSection } from './driver-assignments-section';
import { RouteMessagesSection } from './route-messages-section';
import { updateRouteStatus } from '@/app/(owner)/actions/routes';
import type { FleetMessageWithSender } from '@/app/(owner)/actions/fleet-messages';

interface RoutePageClientProps {
  route: {
    id: string;
    name: string | null;
    origin: string;
    destination: string;
    scheduledDate: Date;
    completedAt: Date | null;
    status: string;
    notes: string | null;
    version: number;
    distanceMiles: number | null;
    driver: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      licenseNumber: string | null
    };
    truck: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string;
      vin: string;
      odometer: number | null;
      documentMetadata: any
    };
    stops?: Array<{
      id: string;
      position: number;
      type: string;
      address: string;
      status: string;
      scheduledAt: Date | null;
      arrivedAt: Date | null;
      departedAt: Date | null;
      notes: string | null;
    }>;
    coDrivers?: Array<{
      id: string;
      driver: { id: string; firstName: string | null; lastName: string | null; email: string };
    }>;
  };
  initialEditMode: boolean;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>;
  trucks: Array<{ id: string; make: string; model: string; year: number; licensePlate: string }>;
  formattedScheduledDate: string;
  formattedCompletedAt?: string;
  // Financial data (pass-through for view mode sections)
  analytics: {
    financials: {
      totalExpenses: string;
      totalRevenue: string;
      totalPaidRevenue: string;
      totalPendingRevenue: string;
      profit: string;
      marginPercent: number;
      isLowMargin: boolean;
    };
    costPerMile: {
      costPerMile: string | null;
      miles: number | null;
    };
    fleetAverage: {
      costPerMile: string | null;
      routeCount: number;
    };
    comparison: {
      comparison: 'above' | 'below' | 'equal' | 'unknown';
      difference: string | null;
      differencePercent: number | null;
    };
    profitMarginThreshold: number;
  };
  expenses: any[];
  payments: any[];
  categories: any[];
  templates: any[];
  documents: any[];
  driverAssignments: any[];
  messages: FleetMessageWithSender[];
  linkedLoads: Array<{
    id: string;
    loadNumber: string;
    origin: string;
    destination: string;
    status: string;
    rate: any;
    pickupDate: Date;
    customer: { companyName: string };
  }>;
}

export function RoutePageClient({
  route,
  initialEditMode,
  drivers,
  trucks,
  formattedScheduledDate,
  formattedCompletedAt,
  analytics,
  expenses,
  payments,
  categories,
  templates,
  documents,
  driverAssignments,
  messages,
  linkedLoads,
}: RoutePageClientProps) {
  const [isEditMode, setIsEditMode] = useState(initialEditMode);
  const [isDirty, setIsDirty] = useState(false);

  // Sync URL state with mode (use replaceState, not router.replace)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isEditMode) {
      url.searchParams.set('mode', 'edit');
    } else {
      url.searchParams.delete('mode');
    }
    window.history.replaceState({}, '', url.toString());
  }, [isEditMode]);

  const handleEnterEdit = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return; // Stay in edit mode
    }
    setIsDirty(false);
    setIsEditMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/routes"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Routes
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground min-w-0">
            {isEditMode
              ? 'Edit Route'
              : (
                <span className="flex items-center gap-3">
                  <span className="font-mono text-base font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    #{route.id.slice(0, 8)}
                  </span>
                  <span>{route.name ?? `${route.origin} \u2192 ${route.destination}`}</span>
                </span>
              )
            }
          </h1>
          {isEditMode ? (
            <button
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted/80 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleEnterEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <Pencil className="h-4 w-4" />
              Edit Route
            </button>
          )}
        </div>
      </div>

      {/* Edit Mode */}
      {isEditMode && (
        <div className="space-y-6">
          {/* Route Edit Form */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <RouteEditSection
              route={route}
              drivers={drivers}
              trucks={trucks}
              onDirtyChange={setIsDirty}
              onCancel={handleCancelEdit}
            />
          </div>

          {/* Read-only financial sections for context */}
          <RouteFinancialSummary
            totalExpenses={analytics.financials.totalExpenses}
            totalRevenue={analytics.financials.totalRevenue}
            totalPaidRevenue={analytics.financials.totalPaidRevenue}
            totalPendingRevenue={analytics.financials.totalPendingRevenue}
            profit={analytics.financials.profit}
            marginPercent={analytics.financials.marginPercent}
            isLowMargin={analytics.financials.isLowMargin}
          />

          {/* Driver Assignments Section */}
          <DriverAssignmentsSection
            routeId={route.id}
            drivers={drivers}
            initialAssignments={driverAssignments}
          />

          {/* Loads on this Route */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Loads on this Route
            </h2>
            {linkedLoads.length > 0 ? (
              <div className="divide-y divide-border">
                {linkedLoads.map((load) => (
                  <div key={load.id} className="flex items-center justify-between py-3 text-sm gap-4 flex-wrap">
                    <Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline shrink-0">
                      #{load.loadNumber}
                    </Link>
                    <span className="text-muted-foreground shrink-0">{load.customer.companyName}</span>
                    <span className="text-muted-foreground">{load.origin} &rarr; {load.destination}</span>
                    <LoadStatusBadge status={load.status} />
                    <span className="font-semibold ml-auto shrink-0">
                      ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No loads linked to this route. Link loads by selecting this route when dispatching.</p>
            )}
          </div>

          {/* Expenses Section (inline editing still works) */}
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

          {/* Payments Section (inline editing still works) */}
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
      )}

      {/* View Mode */}
      {!isEditMode && (
        <div className="space-y-6">
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

          {/* Driver Assignments Section */}
          <DriverAssignmentsSection
            routeId={route.id}
            drivers={drivers}
            initialAssignments={driverAssignments}
          />

          {/* Loads on this Route */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Loads on this Route
            </h2>
            {linkedLoads.length > 0 ? (
              <div className="divide-y divide-border">
                {linkedLoads.map((load) => (
                  <div key={load.id} className="flex items-center justify-between py-3 text-sm gap-4 flex-wrap">
                    <Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline shrink-0">
                      #{load.loadNumber}
                    </Link>
                    <span className="text-muted-foreground shrink-0">{load.customer.companyName}</span>
                    <span className="text-muted-foreground">{load.origin} &rarr; {load.destination}</span>
                    <LoadStatusBadge status={load.status} />
                    <span className="font-semibold ml-auto shrink-0">
                      ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No loads linked to this route. Link loads by selecting this route when dispatching.</p>
            )}
          </div>

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

          {/* Messages Section */}
          <RouteMessagesSection routeId={route.id} initialMessages={messages} />
        </div>
      )}
    </div>
  );
}
