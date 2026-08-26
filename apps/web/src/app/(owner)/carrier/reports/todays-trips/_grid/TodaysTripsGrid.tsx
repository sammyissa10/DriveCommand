'use client';

/**
 * Phase 11 — Today's Trips report.
 *
 * Built on the existing `GridShell`, per the phase constraint *"Reuse the
 * existing DataGrid component. Do not build a bespoke table."* Nothing was
 * installed; the four filters are plain selects above the grid.
 *
 * ─── THE DEFAULT SORT ──────────────────────────────────────────────────────
 *
 * `sorting` is seeded to `attention` ascending, and the server already returns
 * rows in that order, so the first paint is correct before TanStack sorts
 * anything. A user who clicks another header replaces it, which is the point of
 * a default.
 *
 * ─── THE FILTERS ARE SERVER-SIDE ───────────────────────────────────────────
 *
 * They go on the query string rather than into `columnFilters`, so the option
 * lists come back from the same request and can only ever offer values that
 * exist in this tenant's day. `applyReportFilters` composes them, which is
 * Phase 11 verify check 3 ("each filter, then combined").
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { AlertCircle } from 'lucide-react';
import { GridShell } from '@/components/data-grid/shell';
import { logger } from '@/lib/logger';
import { ATTENTION_COPY, BOARD_EMPTY_COPY, INSPECTION_COPY } from '@/lib/carrier/board-constants';
import type { TodaysTripRow } from '@/lib/carrier/board-view';
import type { InspectionBadgeState } from '@/lib/carrier/board-status';
import { todaysTripsColumns } from './columns';

interface FilterOptions {
  statuses: string[];
  inspections: InspectionBadgeState[];
  drivers: { id: string; name: string }[];
  clients: string[];
}

const EMPTY_OPTIONS: FilterOptions = {
  statuses: [],
  inspections: [],
  drivers: [],
  clients: [],
};

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[10rem] rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

export function TodaysTripsGrid() {
  const router = useRouter();
  const [rows, setRows] = useState<TodaysTripRow[]>([]);
  const [options, setOptions] = useState<FilterOptions>(EMPTY_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');

  // Section 13's four filters.
  const [status, setStatus] = useState('');
  const [driverId, setDriverId] = useState('');
  const [client, setClient] = useState('');
  const [inspection, setInspection] = useState('');

  const [sorting, setSorting] = useState<SortingState>([{ id: 'attention', desc: false }]);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (driverId) params.set('driver_id', driverId);
      if (client) params.set('client', client);
      if (inspection) params.set('inspection', inspection);

      const res = await fetch(`/api/v1/carrier/reports/todays-trips?${params.toString()}`);
      if (!res.ok) throw new Error(`Report request failed: ${res.status}`);
      const json = await res.json();
      setRows((json.data?.rows ?? []) as TodaysTripRow[]);
      setOptions((json.data?.options ?? EMPTY_OPTIONS) as FilterOptions);
      setLoadFailed(false);
    } catch (err) {
      // Never `catch(() => [])`. An empty grid must mean "no trips today", and
      // it cannot mean that if a failed request produces the same screen.
      logger.error("Today's Trips report fetch failed", err);
      setRows([]);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [status, driverId, client, inspection]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const table = useReactTable({
    data: rows,
    columns: todaysTripsColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  const tableRows = table.getRowModel().rows;

  const filtersActive = useMemo(
    () => Boolean(status || driverId || client || inspection),
    [status, driverId, client, inspection],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Status" value={status} onChange={setStatus}>
          <option value="">All statuses</option>
          {options.statuses.map((s) => (
            <option key={s} value={s}>
              {s === 'tonu' ? 'TONU' : s.replace('_', ' ')}
            </option>
          ))}
        </Select>

        <Select label="Driver" value={driverId} onChange={setDriverId}>
          <option value="">All drivers</option>
          {options.drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <Select label="Client" value={client} onChange={setClient}>
          <option value="">All clients</option>
          {options.clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select label="Inspection" value={inspection} onChange={setInspection}>
          <option value="">All inspections</option>
          {options.inspections.map((i) => (
            <option key={i} value={i}>
              {INSPECTION_COPY[i].label}
            </option>
          ))}
        </Select>

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setDriverId('');
              setClient('');
              setInspection('');
            }}
            className="h-9 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {loadFailed && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger-foreground"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          We could not load today&apos;s trips. This is not an empty day — try
          refreshing.
        </div>
      )}

      {!isLoading && !loadFailed && rows.length === 0 && (
        <div className="rounded-md border px-4 py-8 text-center">
          <p className="text-sm font-semibold">
            {filtersActive ? 'No trips match these filters' : BOARD_EMPTY_COPY.noTripsTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtersActive
              ? 'Clear a filter to widen the report.'
              : BOARD_EMPTY_COPY.noTripsBody}
          </p>
        </div>
      )}

      <GridShell
        gridId="todays-trips-report"
        table={table}
        rows={tableRows}
        isLoading={isLoading}
        onRefresh={fetchRows}
        onRowDoubleClick={(row) => router.push(`/carrier/trips/${row.id}`)}
        search={globalFilter}
        onSearchChange={setGlobalFilter}
        searchPlaceholder="Search today's trips..."
        recordName="Trip"
        primaryColumn="reference"
        metadataColumns={['driverName', 'truckLabel', 'onTime']}
        statusColumn="status"
      />

      <p className="text-xs text-muted-foreground">
        Sorted so problems come first: {ATTENTION_COPY.FAILED_INSPECTION.label} →{' '}
        {ATTENTION_COPY.NOT_STARTED.label} → {ATTENTION_COPY.BEHIND_SCHEDULE.label} →{' '}
        {ATTENTION_COPY.ON_TRACK.label} → {ATTENTION_COPY.COMPLETED.label} →{' '}
        {ATTENTION_COPY.CLOSED.label}.
      </p>
    </div>
  );
}
