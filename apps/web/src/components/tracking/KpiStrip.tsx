'use client';

import KpiCard from './KpiCard';
import type { BusinessKPIs } from '@/lib/tracking/deriveKpis';

interface KpiStripProps {
  kpis: BusinessKPIs;
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  return `$${value.toLocaleString()}`;
}

function getOnTimeVariant(rate: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (rate === null) return 'neutral';
  if (rate >= 95) return 'success';
  if (rate >= 85) return 'warning';
  return 'danger';
}

export default function KpiStrip({ kpis }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active Loads */}
      <KpiCard
        label="Active Loads"
        value={kpis.activeLoads.toString()}
        delta={
          kpis.activeLoadsDelta !== null
            ? { value: kpis.activeLoadsDelta, isPositive: kpis.activeLoadsDelta >= 0 }
            : null
        }
      />

      {/* Revenue In-Transit */}
      <KpiCard
        label="Revenue In-Transit"
        value={formatRevenue(kpis.revenueInTransit)}
      />

      {/* On-Time Rate */}
      <KpiCard
        label="On-Time Rate"
        value={kpis.onTimeRate !== null ? `${kpis.onTimeRate}%` : '—'}
        variant={getOnTimeVariant(kpis.onTimeRate)}
      />

      {/* Exceptions */}
      <KpiCard
        label="Exceptions"
        value={kpis.exceptionsCount.toString()}
        indicator={kpis.exceptionsCount > 0}
      />
    </div>
  );
}
