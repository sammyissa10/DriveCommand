'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, X } from 'lucide-react';
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
import { updateRouteStatus } from '@/app/(owner)/actions/routes';

interface RoutePageClientProps {
  route: {
    id: string;
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
  };
  initialEditMode: boolean;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isEditMode ? 'Edit Route' : `${route.origin} to ${route.destination}`}
          </h1>
          {isEditMode ? (
            <button
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted/80 transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleEnterEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
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
      )}
    </div>
  );
}
