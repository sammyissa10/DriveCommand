import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getFleetFuelSummary,
  getFuelEfficiencyTrend,
  getCO2Emissions,
  getIdleTimeAnalysis,
  getFuelEfficiencyRankings,
} from './actions';
import { listTags } from '@/app/(owner)/actions/tags';
import { FuelSummaryCard } from '@/components/fuel/fuel-summary-card';
import { MPGTrendChart } from '@/components/fuel/mpg-trend-chart';
import { EmissionsCard } from '@/components/fuel/emissions-card';
import { IdleTimeCard } from '@/components/fuel/idle-time-card';
import { FuelLeaderboard } from '@/components/fuel/fuel-leaderboard';
import { TagFilter } from '@/components/tags/tag-filter';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{ tagId?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Await searchParams (Next.js 16 requirement)
  const { tagId } = await searchParams;

  // Parallel data fetching for all dashboard sections
  let tags: Awaited<ReturnType<typeof listTags>> = [];
  let summary: Awaited<ReturnType<typeof getFleetFuelSummary>> = {
    totalGallons: 0, totalCost: 0, totalMiles: 0, fillUpCount: 0, avgMPG: 0, costPerMile: 0, period: 30,
  };
  let trend: Awaited<ReturnType<typeof getFuelEfficiencyTrend>> = [];
  let emissions: Awaited<ReturnType<typeof getCO2Emissions>> = {
    trucks: [], fleetTotalCO2: 0, fleetTotalGallons: 0, methodology: 'EPA standard: 8.887 kg CO2 per gallon of diesel',
  };
  let idleTime: Awaited<ReturnType<typeof getIdleTimeAnalysis>> = [];
  let rankings: Awaited<ReturnType<typeof getFuelEfficiencyRankings>> = [];

  try {
    [tags, summary, trend, emissions, idleTime, rankings] = await Promise.all([
      listTags(),
      getFleetFuelSummary(30, tagId),
      getFuelEfficiencyTrend(30, tagId),
      getCO2Emissions(30, tagId),
      getIdleTimeAnalysis(30, tagId),
      getFuelEfficiencyRankings(30, tagId),
    ]);
  } catch {
    // DB failure — render dashboard with zero-value defaults
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fuel & Energy Dashboard</h1>
          <p className="text-muted-foreground">Fleet fuel efficiency, emissions, and cost analysis</p>
        </div>
        <TagFilter tags={tags} selectedTagId={tagId || null} />
      </div>

      {/* Top row: Summary card + MPG trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FuelSummaryCard
          totalGallons={summary.totalGallons}
          totalCost={summary.totalCost}
          avgMPG={summary.avgMPG}
          costPerMile={summary.costPerMile}
          fillUpCount={summary.fillUpCount}
          period={summary.period}
        />
        <div className="lg:col-span-2">
          <MPGTrendChart data={trend} />
        </div>
      </div>

      {/* Middle row: Emissions + Idle time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EmissionsCard
          trucks={emissions.trucks}
          fleetTotalCO2={emissions.fleetTotalCO2}
          fleetTotalGallons={emissions.fleetTotalGallons}
          methodology={emissions.methodology}
        />
        <IdleTimeCard data={idleTime} />
      </div>

      {/* Bottom: Fuel efficiency leaderboard full width */}
      <FuelLeaderboard rankings={rankings} />
    </div>
  );
}
