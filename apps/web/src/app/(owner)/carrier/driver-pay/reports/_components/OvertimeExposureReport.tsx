'use client';

/**
 * OvertimeExposureReport — Migrated to DataGrid.
 * OVERTIME pay components with driver/load context, paginated.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta, ServerFetchParams, ServerFetchResult } from '@/components/data-grid/core/types';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney } from './format';

interface OvertimeExposureRow {
  driverId: string;
  driverName: string;
  loadId: string | null;
  referenceNumber: string | null;
  overtimeAmount: string;
  actualHours: string | null;
  assignmentId: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  totalLoadsAffected: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OvertimeExposureRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<OvertimeExposureRow, unknown>[] = [
  {
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    cell: ({ row }) => (
      <span className="font-medium text-sm">{row.original.driverName}</span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'referenceNumber',
    accessorKey: 'referenceNumber',
    header: 'Load Ref',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.referenceNumber ?? '—'}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'overtimeAmount',
    accessorKey: 'overtimeAmount',
    header: 'OT Amount',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
        {fmtMoney(row.original.overtimeAmount)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'actualHours',
    accessorKey: 'actualHours',
    header: 'Actual Hours',
    cell: ({ row }) => (
      <span className="text-right text-sm">{row.original.actualHours ?? '—'}</span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'assignmentId',
    accessorKey: 'assignmentId',
    header: 'Assignment ID',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {row.original.assignmentId.slice(0, 8)}…
      </span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OvertimeExposureReport({ period, customStart, customEnd, driverIds }: Props) {
  const [headerData, setHeaderData] = useState<{
    bigNumber: string;
    deltaPct: number | null;
    totalLoadsAffected: number;
  } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);

  // Fetch header data on mount
  useEffect(() => {
    const fetchHeader = async () => {
      setInitialLoading(true);
      try {
        const params = new URLSearchParams({ period, page: '1', pageSize: '1' });
        if (customStart) params.set('customStart', customStart);
        if (customEnd) params.set('customEnd', customEnd);
        if (driverIds?.length) {
          for (const id of driverIds) params.append('driverIds', id);
        }
        const res = await fetch(`/api/driver-pay/reports/overtime-exposure?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as ApiResult;
          setHeaderData({
            bigNumber: json.bigNumber,
            deltaPct: json.deltaPct,
            totalLoadsAffected: json.totalLoadsAffected,
          });
          setIsEmpty(json.totalCount === 0);
        }
      } finally {
        setInitialLoading(false);
      }
    };
    void fetchHeader();
  }, [period, customStart, customEnd, driverIds]);

  // Server-side data fetcher for DataGrid
  const dataFetcher = useCallback(
    async (params: ServerFetchParams): Promise<ServerFetchResult<OvertimeExposureRow>> => {
      const queryParams = new URLSearchParams({
        period,
        page: String(params.page + 1),
        pageSize: String(params.pageSize),
      });

      if (customStart) queryParams.set('customStart', customStart);
      if (customEnd) queryParams.set('customEnd', customEnd);
      if (driverIds?.length) {
        for (const id of driverIds) queryParams.append('driverIds', id);
      }

      if (params.sort) {
        queryParams.set('sortBy', params.sort.field);
        queryParams.set('sortDir', params.sort.direction);
      }

      if (params.search) {
        queryParams.set('search', params.search);
      }

      if (params.filters.length > 0) {
        queryParams.set('filters', JSON.stringify(params.filters));
      }

      const res = await fetch(`/api/driver-pay/reports/overtime-exposure?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch overtime exposure data');
      }

      const json = (await res.json()) as ApiResult;
      return { rows: json.rows, total: json.totalCount };
    },
    [period, customStart, customEnd, driverIds]
  );

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'overtime-exposure-report',
    columns,
    dataFetcher,
    rowIdAccessor: (row) => row.assignmentId,
    initialPageSize: 25,
    enableUrlSync: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  const csvParams: Record<string, string | string[] | undefined> = {
    period,
    customStart,
    customEnd,
    driverIds,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Overtime Exposure</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/overtime-exposure" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialLoading ? (
          <ReportTableSkeleton rows={5} columns={5} />
        ) : isEmpty ? (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle={`Total overtime exposure (${headerData.totalLoadsAffected} loads)`}
                deltaPct={headerData.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle={`Total overtime exposure (${headerData.totalLoadsAffected} loads)`}
                deltaPct={headerData.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <GridShell
              gridId="overtime-exposure-report"
              table={table}
              rows={rows}
              isLoading={isLoading}
              columns={columns}
              dataFetcher={dataFetcher}
              rowIdAccessor={(row) => row.assignmentId}
              pagination={{
                pageIndex,
                pageSize,
                pageCount,
                totalRows: table.getRowCount(),
                canPreviousPage: table.getCanPreviousPage(),
                canNextPage: table.getCanNextPage(),
                previousPage: () => table.previousPage(),
                nextPage: () => table.nextPage(),
                setPageSize: (size) => table.setPageSize(size),
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
