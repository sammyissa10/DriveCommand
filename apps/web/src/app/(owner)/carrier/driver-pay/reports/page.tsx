/**
 * /carrier/driver-pay/reports — Driver Pay Reports Dashboard (server component)
 *
 * Updated in quick-345 to support 8 tabs via ?tab= searchParam.
 * All 7 new report tabs are client components that fetch their own data.
 * The Overview tab renders server-side as before (no regression).
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
import { ReportTabNav } from './_components/ReportTabNav';
import { AccessorialSpendReport } from './_components/AccessorialSpendReport';
import { LoadProfitabilityReport } from './_components/LoadProfitabilityReport';
import { ComponentTypeReport } from './_components/ComponentTypeReport';
import { OvertimeExposureReport } from './_components/OvertimeExposureReport';
import { OverrideAuditReport } from './_components/OverrideAuditReport';
import { DeductionBalancesReport } from './_components/DeductionBalancesReport';
import { SettlementHistoryReport } from './_components/SettlementHistoryReport';

export const metadata = { title: 'Driver Pay Reports | DriveCommand' };

type TabKey =
  | 'overview'
  | 'accessorial'
  | 'profitability'
  | 'components'
  | 'overtime'
  | 'override-audit'
  | 'deduction-balances'
  | 'settlement-history';

const VALID_PERIODS: PeriodKey[] = ['this_week', 'last_week', 'this_month', 'last_month', 'custom'];
const VALID_TABS: TabKey[] = [
  'overview', 'accessorial', 'profitability', 'components',
  'overtime', 'override-audit', 'deduction-balances', 'settlement-history',
];

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
    tab?: string;
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

  const rawTab = params.tab ?? 'overview';
  const tab: TabKey = VALID_TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'overview';

  const filters: ReportFilters = { driverIds, employmentType, status };

  let range;
  try {
    range = getPeriodRange(period, customStart, customEnd);
  } catch {
    range = getPeriodRange('this_week');
  }

  const priorRange = getPriorPeriodRange(range);

  // Only compute Overview data server-side when on the overview tab
  // This keeps the other tabs fast (they fetch client-side)
  let kpis = null;
  let netPayTrend = null;
  let deductionBreakdown = null;

  if (tab === 'overview') {
    const prisma = await getTenantPrisma();

    [kpis, netPayTrend, deductionBreakdown] = await Promise.all([
      computeOverviewKpis(prisma, session.tenantId, range, filters),
      computeNetPayTrend(prisma, session.tenantId, range, filters),
      computeDeductionBreakdown(prisma, session.tenantId, range, filters),
    ]);
  }

  const isEmpty = tab === 'overview' && kpis?.totalPayroll.current === '0.00';

  // Props to pass to client report components
  const reportProps = {
    period,
    customStart: params.customStart,
    customEnd: params.customEnd,
    driverIds,
  };

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

      {/* Tab navigation */}
      <Suspense fallback={<div className="h-10 border-b" />}>
        <ReportTabNav active={tab} />
      </Suspense>

      {/* Tab content */}
      {tab === 'overview' && (
        <>
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
                    value={kpis!.totalPayroll.current}
                    deltaPct={kpis!.totalPayroll.delta}
                    isMoney
                  />
                  <KpiCard
                    label="Drivers Paid"
                    value={kpis!.driversPaid.current}
                    deltaPct={kpis!.driversPaid.delta}
                  />
                  <KpiCard
                    label="Avg Net Pay"
                    value={kpis!.avgNetPay.current}
                    deltaPct={kpis!.avgNetPay.delta}
                    isMoney
                  />
                  <KpiCard
                    label="Total Deductions"
                    value={kpis!.totalDeductions.current}
                    deltaPct={kpis!.totalDeductions.delta}
                    isMoney
                  />
                  <KpiCard
                    label="Total Bonuses"
                    value={kpis!.totalBonuses.current}
                    deltaPct={kpis!.totalBonuses.delta}
                    isMoney
                  />
                </div>
              </Suspense>

              {/* Charts */}
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <NetPayTrendChart data={netPayTrend!} />
                  <DeductionDonut data={deductionBreakdown!} />
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
                    <button
                      title="Use the Export CSV button on each individual report tab"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 cursor-not-allowed opacity-50"
                      disabled
                    >
                      Export CSV (use individual report tabs)
                    </button>
                  </div>
                  <OperationalMetrics period={period} />
                </div>
              </Suspense>
            </>
          )}
        </>
      )}

      {tab === 'accessorial' && (
        <AccessorialSpendReport {...reportProps} />
      )}

      {tab === 'profitability' && (
        <LoadProfitabilityReport {...reportProps} />
      )}

      {tab === 'components' && (
        <ComponentTypeReport {...reportProps} />
      )}

      {tab === 'overtime' && (
        <OvertimeExposureReport {...reportProps} />
      )}

      {tab === 'override-audit' && (
        <OverrideAuditReport {...reportProps} />
      )}

      {tab === 'deduction-balances' && (
        <DeductionBalancesReport driverIds={driverIds} />
      )}

      {tab === 'settlement-history' && (
        <SettlementHistoryReport {...reportProps} />
      )}

      {/* Unused — suppress TS warning for priorRange */}
      {false && <span>{priorRange.start.toISOString()}</span>}
    </div>
  );
}
