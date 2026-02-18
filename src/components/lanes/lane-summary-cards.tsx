'use client';

import { LaneAnalytics } from '@/app/(owner)/actions/lane-analytics';

interface LaneSummaryCardsProps {
  data: LaneAnalytics;
}

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(parseFloat(value));
}

export function LaneSummaryCards({ data }: LaneSummaryCardsProps) {
  const { lanes, totalLanes, totalRoutes, overallProfit } = data;

  const bestLane = lanes.length > 0 ? lanes[0] : null;
  const worstLane = lanes.length > 0 ? lanes[lanes.length - 1] : null;

  const profitValue = parseFloat(overallProfit);
  const profitColor = profitValue >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Lanes */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Total Lanes</p>
        <p className="mt-2 text-3xl font-bold">{totalLanes}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalRoutes} completed route{totalRoutes !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Overall Profit */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Overall Profit</p>
        <p className={`mt-2 text-3xl font-bold ${profitColor}`}>
          {formatCurrency(overallProfit)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.overallMargin.toFixed(1)}% margin
        </p>
      </div>

      {/* Best Lane */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Best Lane</p>
        {bestLane ? (
          <>
            <p className="mt-2 text-lg font-bold truncate" title={bestLane.lane}>
              {bestLane.origin}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              to {bestLane.destination}
            </p>
            <p className="mt-1 text-sm font-semibold text-green-600">
              {formatCurrency(bestLane.profit)} profit
            </p>
          </>
        ) : (
          <p className="mt-2 text-2xl font-bold text-muted-foreground">N/A</p>
        )}
      </div>

      {/* Worst Lane */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Worst Lane</p>
        {worstLane ? (
          <>
            <p className="mt-2 text-lg font-bold truncate" title={worstLane.lane}>
              {worstLane.origin}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              to {worstLane.destination}
            </p>
            <p className={`mt-1 text-sm font-semibold ${parseFloat(worstLane.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(worstLane.profit)} profit
            </p>
          </>
        ) : (
          <p className="mt-2 text-2xl font-bold text-muted-foreground">N/A</p>
        )}
      </div>
    </div>
  );
}
