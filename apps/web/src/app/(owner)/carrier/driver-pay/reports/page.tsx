/**
 * /carrier/driver-pay/reports — Driver Pay Reports Dashboard (server component)
 */

import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarOff } from 'lucide-react';
import {
  getPeriodRange,
  getPriorPeriodRange,
  computeOverviewKpis,
  computeNetPayTrend,
  computeDeductionBreakdown,
  type PeriodKey,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';
import { KpiCard } from './_components/KpiCard';
import { PeriodSelector } from './_components/PeriodSelector';
import { FilterBar } from './_components/FilterBar';
import { NetPayTrendChart } from './_components/NetPayTrendChart';
import { DeductionDonut } from './_components/DeductionDonut';
import { SettlementsTable } from './_components/SettlementsTable';
import { OperationalMetrics } from './_components/OperationalMetrics';

export const metadata = { title: 'Driver Pay Reports | DriveCommand' };

const VALID_PERIODS: PeriodKey[] = ['this_week', 'last_week', 'this_month', 'last_month', 'custom'];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    customStart?: string;
    customEnd?: string;
    driverIds?: string;
    employmentType?: string;
    status?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role.toUpperCase();
  if (role === UserRole.DRIVER) redirect('/driver');
  const isManagerOrAbove =
    role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SYSTEM_ADMIN;
  if (!isManagerOrAbove) redirect('/carrier/dashboard');

  const params = await searchParams;
  const periodParam = (params.period ?? 'this_week') as PeriodKey;
  const period: PeriodKey = VALID_PERIODS.includes(periodParam) ? periodParam : 'this_week';

  const customStart = params.customStart ? new Date(params.customStart) : undefined;
  const customEnd = params.customEnd ? new Date(params.customEnd) : undefined;
  const driverIds = params.driverIds ? params.driverIds.split(',').filter(Boolean) : undefined;
  const employmentType = (params.employmentType ?? 'ALL') as ReportFilters['employmentType'];
  const status = params.status ?? 'ALL';

  const filters: ReportFilters = { driverIds, employmentType, status };

  let range;
  try {
    range = getPeriodRange(period, customStart, customEnd);
  } catch {
    range = getPeriodRange('this_week');
  }

  const priorRange = getPriorPeriodRange(range);

  const prisma = await getTenantPrisma();

  const [kpis, netPayTrend, deductionBreakdown] = await Promise.all([
    computeOverviewKpis(prisma, session.tenantId, range, filters),
    computeNetPayTrend(prisma, session.tenantId, range, filters),
    computeDeductionBreakdown(prisma, session.tenantId, range, filters),
  ]);

  const isEmpty = kpis.totalPayroll.current === '0.00';

  return (
    <div className="flex h-full flex-col p-6 gap-6">
      {/* Header */}
      <header>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
          <Link href="/carrier/driver-pay" className="hover:text-foreground">
            Driver Pay
          </Link>
          <span>/</span>
          <span className="text-foreground">Reports</span>
        </nav>
        <h1 className="text-2xl font-semibold">Driver Pay Reports</h1>
        <p className="text-sm text-muted-foreground">
          Payroll health overview for {period.replace(/_/g, ' ')}.
        </p>
      </header>

      {/* Sticky filter bar */}
      <div className="sticky top-16 z-10 bg-background border-b pb-3 -mx-6 px-6 flex flex-wrap items-center gap-3">
        <PeriodSelector currentPeriod={period} />
        <div className="flex-1" />
        <FilterBar
          currentDriverIds={driverIds ?? []}
          currentEmploymentType={employmentType ?? 'ALL'}
          currentStatus={status}
        />
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <CalendarOff className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="text-lg font-medium">No payroll activity in this period</p>
            <p className="text-sm text-muted-foreground">
              Try selecting a different period or adjusting filters.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard
                label="Total Payroll"
                value={kpis.totalPayroll.current}
                deltaPct={kpis.totalPayroll.delta}
                isMoney
              />
              <KpiCard
                label="Drivers Paid"
                value={kpis.driversPaid.current}
                deltaPct={kpis.driversPaid.delta}
              />
              <KpiCard
                label="Avg Net Pay"
                value={kpis.avgNetPay.current}
                deltaPct={kpis.avgNetPay.delta}
                isMoney
              />
              <KpiCard
                label="Total Deductions"
                value={kpis.totalDeductions.current}
                deltaPct={kpis.totalDeductions.delta}
                isMoney
              />
              <KpiCard
                label="Total Bonuses"
                value={kpis.totalBonuses.current}
                deltaPct={kpis.totalBonuses.delta}
                isMoney
              />
            </div>
          </Suspense>

          {/* Charts */}
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <NetPayTrendChart data={netPayTrend} />
              <DeductionDonut data={deductionBreakdown} />
            </div>
          </Suspense>

          {/* Settlements table */}
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <SettlementsTable
              initialQuery={{ period, driverIds, employmentType, status }}
            />
          </Suspense>

          {/* Operational metrics */}
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                {/* TODO(phase-11): Wire to Phase 11 export engine when shipped */}
                <button
                  title="TODO: Wire to Phase 11 export engine"
                  onClick={undefined}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 cursor-not-allowed opacity-50"
                  disabled
                >
                  Export Metrics CSV (Phase 11)
                </button>
              </div>
              <OperationalMetrics period={period} />
            </div>
          </Suspense>
        </>
      )}
    </div>
  );
}
