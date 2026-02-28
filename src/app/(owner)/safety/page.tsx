import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getFleetSafetyScore, getEventDistribution, getSafetyScoreTrend, getDriverRankings } from './actions';
import { listTags } from '@/app/(owner)/actions/tags';
import { SafetyScoreCard } from '@/components/safety/safety-score-card';
import { EventDistributionChart } from '@/components/safety/event-distribution-chart';
import { SafetyTrendChart } from '@/components/safety/safety-trend-chart';
import { DriverLeaderboard } from '@/components/safety/driver-leaderboard';
import { ThresholdConfig } from '@/components/safety/threshold-config';
import { TagFilter } from '@/components/tags/tag-filter';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ tagId?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Await searchParams (Next.js 16 requirement)
  const { tagId } = await searchParams;

  // Parallel data fetching for all dashboard sections
  let tags: Awaited<ReturnType<typeof listTags>> = [];
  let score: Awaited<ReturnType<typeof getFleetSafetyScore>> = {
    score: 100, totalEvents: 0, eventsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }, period: 30,
  };
  let distribution: Awaited<ReturnType<typeof getEventDistribution>> = { byType: [], bySeverity: [] };
  let trends: Awaited<ReturnType<typeof getSafetyScoreTrend>> = [];
  let rankings: Awaited<ReturnType<typeof getDriverRankings>> = [];

  try {
    [tags, score, distribution, trends, rankings] = await Promise.all([
      listTags(),
      getFleetSafetyScore(30, tagId),
      getEventDistribution(30, tagId),
      getSafetyScoreTrend(30, tagId),
      getDriverRankings(30, tagId),
    ]);
  } catch {
    // DB failure — render dashboard with zero-value defaults
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Safety Dashboard</h1>
          <p className="text-muted-foreground">Fleet-wide safety performance and driver rankings</p>
        </div>
        <TagFilter tags={tags} selectedTagId={tagId || null} />
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
