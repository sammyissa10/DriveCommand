import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getLaneAnalytics } from '@/app/(owner)/actions/lane-analytics';
import { LaneSummaryCards } from '@/components/lanes/lane-summary-cards';
import { LaneProfitChart } from '@/components/lanes/lane-profit-chart';
import { LaneProfitabilityTable } from '@/components/lanes/lane-profitability-table';
import Link from 'next/link';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

const TIMEFRAME_OPTIONS = [
  { days: 30, label: '30 Days' },
  { days: 90, label: '90 Days' },
  { days: 180, label: '180 Days' },
  { days: 365, label: '1 Year' },
];

export default async function LaneAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Await searchParams (Next.js 16 requirement)
  const { days: daysParam } = await searchParams;
  const days = daysParam ? parseInt(daysParam, 10) : 90;
  const safeDays = isNaN(days) || days <= 0 ? 90 : days;

  let data: Awaited<ReturnType<typeof getLaneAnalytics>> = {
    lanes: [],
    totalLanes: 0,
    totalRoutes: 0,
    overallRevenue: '0.00',
    overallExpenses: '0.00',
    overallProfit: '0.00',
    overallMargin: 0,
    timeframeDays: safeDays,
  };
  try {
    data = await getLaneAnalytics(safeDays);
  } catch {
    // DB failure — render analytics with zero-value defaults
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lane Profitability Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Profitability by origin-destination pair — identify your best and worst routes
          </p>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm self-start">
          {TIMEFRAME_OPTIONS.map((opt) => {
            const isActive = safeDays === opt.days;
            return (
              <Link
                key={opt.days}
                href={`/lane-analytics?days=${opt.days}`}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <LaneSummaryCards data={data} />

      {/* Bar chart */}
      <LaneProfitChart lanes={data.lanes} />

      {/* Full sortable table */}
      <LaneProfitabilityTable lanes={data.lanes} />
    </div>
  );
}
