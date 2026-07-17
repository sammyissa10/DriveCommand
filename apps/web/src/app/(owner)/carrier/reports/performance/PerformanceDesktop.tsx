'use client';

import { fmtDollar, onTimePctClass, type PerformanceRow } from './performance-report-utils';

interface Props {
  rows: PerformanceRow[];
  loading: boolean;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  driverFilter: string;
  setDriverFilter: (v: string) => void;
  fetchRows: () => void;
}

/** Performance Report — desktop view (unchanged from the original page). */
export function PerformanceDesktop({
  rows,
  loading,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  driverFilter,
  setDriverFilter,
  fetchRows,
}: Props) {
  const uniqueDrivers = Array.from(new Set(rows.map((r) => r.driver_name))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Performance Report
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Dispatch metrics with on-time and dwell tracking
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Driver</label>
          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All drivers</option>
            {uniqueDrivers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchRows}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Filter'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No data for selected period
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Dispatch #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Driver</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Stops</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">On-Time %</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Avg Dwell (min)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actual Miles</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Total Expenses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                // Client-side driver filter (for the dropdown after initial load)
                if (driverFilter && r.driver_name !== driverFilter) return null;
                return (
                  <tr key={r.dispatch_id} className={idx % 2 === 1 ? 'bg-muted/50' : ''}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {r.dispatch_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.driver_name}</td>
                    <td className="px-4 py-3 text-right">{r.total_stops}</td>
                    <td className="px-4 py-3 text-right">
                      {r.on_time_pct != null ? (
                        <span className={onTimePctClass(r.on_time_pct)}>
                          {r.on_time_pct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.avg_dwell_minutes != null ? (
                        r.avg_dwell_minutes.toFixed(1)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.actual_miles != null ? (
                        parseFloat(r.actual_miles).toLocaleString()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtDollar(r.total_expenses)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
