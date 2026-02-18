'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { LaneData } from '@/app/(owner)/actions/lane-analytics';

interface LaneProfitChartProps {
  lanes: LaneData[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function truncateLane(lane: string, maxLen: number = 20): string {
  if (lane.length <= maxLen) return lane;
  return lane.slice(0, maxLen - 1) + '…';
}

interface TooltipPayloadEntry {
  payload: LaneData & { profitNum: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{d.lane}</p>
      <p>
        Profit:{' '}
        <span className={d.profitNum >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {formatCurrency(d.profitNum)}
        </span>
      </p>
      <p className="text-muted-foreground">{d.routeCount} route{d.routeCount !== 1 ? 's' : ''}</p>
      <p className="text-muted-foreground">Margin: {d.marginPercent.toFixed(1)}%</p>
    </div>
  );
}

export function LaneProfitChart({ lanes }: LaneProfitChartProps) {
  if (lanes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Top Lanes by Profit</h2>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No lane data available</p>
        </div>
      </div>
    );
  }

  // Show top 10 lanes only
  const chartData = lanes.slice(0, 10).map((lane) => ({
    ...lane,
    displayName: truncateLane(lane.lane),
    profitNum: parseFloat(lane.profit),
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Top Lanes by Profit</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="displayName"
            tick={{ fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 11 }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="profitNum" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.profitNum >= 0 ? '#16a34a' : '#dc2626'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
