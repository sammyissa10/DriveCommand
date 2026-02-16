import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getFleetSafetyScore, getEventDistribution, getSafetyScoreTrend, getDriverRankings } from './actions';
import { SafetyScoreCard } from '@/components/safety/safety-score-card';
import { EventDistributionChart } from '@/components/safety/event-distribution-chart';
import { SafetyTrendChart } from '@/components/safety/safety-trend-chart';
import { DriverLeaderboard } from '@/components/safety/driver-leaderboard';
import { ThresholdConfig } from '@/components/safety/threshold-config';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

export default async function SafetyPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parallel data fetching for all dashboard sections
  const [score, distribution, trends, rankings] = await Promise.all([
    getFleetSafetyScore(),
    getEventDistribution(),
    getSafetyScoreTrend(30),
    getDriverRankings(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Safety Dashboard</h1>
        <p className="text-muted-foreground">Fleet-wide safety performance and driver rankings</p>
      </div>

      {/* Top row: Score card + Event distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SafetyScoreCard
          score={score.score}
          totalEvents={score.totalEvents}
          eventsBySeverity={score.eventsBySeverity}
          period={score.period}
        />
        <div className="lg:col-span-2">
          <EventDistributionChart
            byType={distribution.byType}
            bySeverity={distribution.bySeverity}
          />
        </div>
      </div>

      {/* Trend chart: full width */}
      <SafetyTrendChart data={trends} />

      {/* Bottom row: Leaderboard + Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DriverLeaderboard rankings={rankings} />
        <ThresholdConfig />
      </div>
    </div>
  );
}
