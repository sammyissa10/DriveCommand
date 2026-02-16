import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getFleetFuelSummary,
  getFuelEfficiencyTrend,
  getCO2Emissions,
  getIdleTimeAnalysis,
  getFuelEfficiencyRankings,
} from './actions';
import { FuelSummaryCard } from '@/components/fuel/fuel-summary-card';
import { MPGTrendChart } from '@/components/fuel/mpg-trend-chart';
import { EmissionsCard } from '@/components/fuel/emissions-card';
import { IdleTimeCard } from '@/components/fuel/idle-time-card';
import { FuelLeaderboard } from '@/components/fuel/fuel-leaderboard';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

export default async function FuelPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parallel data fetching for all dashboard sections
  const [summary, trend, emissions, idleTime, rankings] = await Promise.all([
    getFleetFuelSummary(),
    getFuelEfficiencyTrend(30),
    getCO2Emissions(),
    getIdleTimeAnalysis(),
    getFuelEfficiencyRankings(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fuel & Energy Dashboard</h1>
        <p className="text-muted-foreground">Fleet fuel efficiency, emissions, and cost analysis</p>
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
