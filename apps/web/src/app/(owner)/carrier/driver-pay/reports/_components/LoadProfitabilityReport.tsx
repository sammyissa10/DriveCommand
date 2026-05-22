'use client';

/**
 * LoadProfitabilityReport — Migrated to DataGrid.
 * Per-load revenue minus driver pay, sortable + paginated.
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
import { fmtMoney, fmtDate } from './format';

interface LoadProfitabilityRow {
  loadId: string;
  referenceNumber: string | null;
  clientName: string | null;
  revenue: string;
  totalDriverPay: string;
  profit: string;
  profitMarginPct: number | null;
  driverCount: number;
  createdAt: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: LoadProfitabilityRow[];
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

const columns: ColumnDef<LoadProfitabilityRow, unknown>[] = [
  {
    id: 'referenceNumber',
    accessorKey: 'referenceNumber',
    header: 'Load Ref',
    cell: ({ row }) => (
      <span className="font-medium text-sm">
        {row.original.referenceNumber ?? '—'}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'clientName',
    accessorKey: 'clientName',
    header: 'Client',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.clientName ?? '—'}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'revenue',
    accessorKey: 'revenue',
    header: 'Revenue',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.revenue)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'totalDriverPay',
    accessorKey: 'totalDriverPay',
    header: 'Driver Pay',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.totalDriverPay)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'profit',
    accessorKey: 'profit',
    header: 'Profit',
    cell: ({ row }) => {
      const profit = parseFloat(row.original.profit);
      return (
        <span
          className={`text-right font-mono text-sm font-semibold ${
            profit < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {fmtMoney(row.original.profit)}
        </span>
      );
    },
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'profitMarginPct',
    accessorKey: 'profitMarginPct',
    header: 'Margin %',
    cell: ({ row }) => (
      <span className="text-right text-sm">
        {row.original.profitMarginPct != null
          ? `${row.original.profitMarginPct.toFixed(1)}%`
          : '—'}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'driverCount',
    accessorKey: 'driverCount',
    header: 'Drivers',
    cell: ({ row }) => (
      <span className="text-right text-sm">{row.original.driverCount}</span>
    ),
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {fmtDate(row.original.createdAt)}
      </span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadProfitabilityReport({ period, customStart, customEnd, driverIds }: Props) {
  const [headerData, setHeaderData] = useState<{ bigNumber: string; deltaPct: number | null } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);

  // Fetch header data (bigNumber) on mount
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
        const res = await fetch(`/api/driver-pay/reports/load-profitability?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as ApiResult;
          setHeaderData({ bigNumber: json.bigNumber, deltaPct: json.deltaPct });
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
    async (params: ServerFetchParams): Promise<ServerFetchResult<LoadProfitabilityRow>> => {
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

      const res = await fetch(`/api/driver-pay/reports/load-profitability?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch load profitability data');
      }

      const json = (await res.json()) as ApiResult;
      return { rows: json.rows, total: json.totalCount };
    },
    [period, customStart, customEnd, driverIds]
  );

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'load-profitability-report',
    columns,
    dataFetcher,
    rowIdAccessor: (row) => row.loadId,
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
          <CardTitle className="text-base font-semibold">Load Profitability</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/load-profitability" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialLoading ? (
          <ReportTableSkeleton rows={5} columns={8} />
        ) : isEmpty ? (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle="Total profit this period"
                deltaPct={headerData.deltaPct}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle="Total profit this period"
                deltaPct={headerData.deltaPct}
              />
            )}
            <GridShell
              gridId="load-profitability-report"
              table={table}
              rows={rows}
              isLoading={isLoading}
              columns={columns}
              dataFetcher={dataFetcher}
              rowIdAccessor={(row) => row.loadId}
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
