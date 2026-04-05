'use client';

import { useEffect, useState } from 'react';
import { Package, DollarSign, Clock, CheckCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStartISO(): string {
  const d = new Date();
  // Monday = day 1; Sunday = day 0 → offset back to Monday
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KPIData {
  loadsThisWeek: number | null;
  revenueThisWeek: number | null;
  avgDwellMinutes: number | null;
  onTimePct: number | null;
}

interface PerformanceRow {
  on_time_pct: number | null;
  avg_dwell_minutes: number | null;
}

interface RevenueSummary {
  total_invoiced: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KPIStrip() {
  const [data, setData] = useState<KPIData>({
    loadsThisWeek: null,
    revenueThisWeek: null,
    avgDwellMinutes: null,
    onTimePct: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const weekStart = getWeekStartISO();
    const today = getTodayISO();

    Promise.all([
      fetch(
        `/api/v1/carrier/reports/performance?date_from=${weekStart}&date_to=${today}`
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `/api/v1/carrier/reports/revenue?date_from=${weekStart}&date_to=${today}`
      ).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([perfJson, revJson]) => {
        const perfRows: PerformanceRow[] = perfJson?.data ?? [];
        const summary: RevenueSummary | undefined = revJson?.data?.summary;

        // Loads this week = number of performance rows (1 row per dispatch)
        const loadsThisWeek = perfRows.length;

        // Revenue this week
        const revenueThisWeek = summary ? parseFloat(summary.total_invoiced) : 0;

        // Avg dwell (minutes)
        const dwellValues = perfRows
          .map((r) => r.avg_dwell_minutes)
          .filter((v): v is number => v != null);
        const avgDwellMinutes =
          dwellValues.length > 0
            ? dwellValues.reduce((a, b) => a + b, 0) / dwellValues.length
            : null;

        // On-time %
        const otValues = perfRows
          .map((r) => r.on_time_pct)
          .filter((v): v is number => v != null);
        const onTimePct =
          otValues.length > 0
            ? otValues.reduce((a, b) => a + b, 0) / otValues.length
            : null;

        setData({ loadsThisWeek, revenueThisWeek, avgDwellMinutes, onTimePct });
      })
      .catch(() => {
        setData({ loadsThisWeek: 0, revenueThisWeek: 0, avgDwellMinutes: null, onTimePct: null });
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      icon: Package,
      label: 'Loads This Week',
      value: loading ? null : data.loadsThisWeek,
      format: (v: number) => String(v),
    },
    {
      icon: DollarSign,
      label: 'Revenue This Week',
      value: loading ? null : data.revenueThisWeek,
      format: (v: number) => fmtCurrency(v),
    },
    {
      icon: Clock,
      label: 'Avg Dwell (min)',
      value: loading ? null : data.avgDwellMinutes,
      format: (v: number) => v.toFixed(1),
    },
    {
      icon: CheckCircle,
      label: 'On-Time %',
      value: loading ? null : data.onTimePct,
      format: (v: number) => `${v.toFixed(1)}%`,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, label, value, format }) => (
        <div
          key={label}
          className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{label}</span>
          </div>
          {loading ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-foreground">
              {value == null ? '—' : format(value)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
