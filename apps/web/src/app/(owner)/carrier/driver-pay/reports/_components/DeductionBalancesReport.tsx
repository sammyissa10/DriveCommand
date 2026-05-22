'use client';

/**
 * DeductionBalancesReport — Migrated to DataGrid.
 * FIXED_INSTALLMENTS deductions with outstanding balance.
 * Point-in-time: no period filter.
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

interface DeductionBalanceRow {
  driverId: string;
  driverName: string;
  deductionId: string;
  deductionType: string;
  totalAmount: string;
  amountCollected: string;
  remaining: string;
  percentComplete: number;
  schedule: string;
}

interface ApiResult {
  bigNumber: string;
  driversWithBalanceCount: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: DeductionBalanceRow[];
}

interface Props {
  driverIds?: string[];
}

const EMPTY_MSG = 'No outstanding deduction balances found.';

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<DeductionBalanceRow, unknown>[] = [
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
    id: 'deductionType',
    accessorKey: 'deductionType',
    header: 'Type',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.deductionType}</span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'totalAmount',
    accessorKey: 'totalAmount',
    header: 'Total',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.totalAmount)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'amountCollected',
    accessorKey: 'amountCollected',
    header: 'Collected',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.amountCollected)}
      </span>
    ),
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'remaining',
    accessorKey: 'remaining',
    header: 'Remaining',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
        {fmtMoney(row.original.remaining)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'percentComplete',
    accessorKey: 'percentComplete',
    header: '% Complete',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden"
          style={{ width: 60 }}
        >
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${Math.min(100, row.original.percentComplete)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {row.original.percentComplete.toFixed(0)}%
        </span>
      </div>
    ),
    enableSorting: true,
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'schedule',
    accessorKey: 'schedule',
    header: 'Schedule',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.schedule}</span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeductionBalancesReport({ driverIds }: Props) {
  const [headerData, setHeaderData] = useState<{ bigNumber: string; driversWithBalanceCount: number } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);

  // Fetch header data on mount
  useEffect(() => {
    const fetchHeader = async () => {
      setInitialLoading(true);
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '1' });
        if (driverIds?.length) {
          for (const id of driverIds) params.append('driverIds', id);
        }
        const res = await fetch(`/api/driver-pay/reports/deduction-balances?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as ApiResult;
          setHeaderData({
            bigNumber: json.bigNumber,
            driversWithBalanceCount: json.driversWithBalanceCount,
          });
          setIsEmpty(json.totalCount === 0);
        }
      } finally {
        setInitialLoading(false);
      }
    };
    void fetchHeader();
  }, [driverIds]);

  // Server-side data fetcher for DataGrid
  const dataFetcher = useCallback(
    async (params: ServerFetchParams): Promise<ServerFetchResult<DeductionBalanceRow>> => {
      const queryParams = new URLSearchParams({
        page: String(params.page + 1),
        pageSize: String(params.pageSize),
      });

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

      const res = await fetch(`/api/driver-pay/reports/deduction-balances?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch deduction balances');
      }

      const json = (await res.json()) as ApiResult;
      return { rows: json.rows, total: json.totalCount };
    },
    [driverIds]
  );

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'deduction-balances-report',
    columns,
    dataFetcher,
    rowIdAccessor: (row) => row.deductionId,
    initialPageSize: 25,
    enableUrlSync: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  const csvParams: Record<string, string | string[] | undefined> = {
    driverIds,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Deduction Balances</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/deduction-balances" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialLoading ? (
          <ReportTableSkeleton rows={5} columns={7} />
        ) : isEmpty ? (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle={`Outstanding across ${headerData.driversWithBalanceCount} drivers`}
                deltaPct={null}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle={`Outstanding across ${headerData.driversWithBalanceCount} driver${headerData.driversWithBalanceCount !== 1 ? 's' : ''}`}
                deltaPct={null}
              />
            )}
            <GridShell
              gridId="deduction-balances-report"
              table={table}
              rows={rows}
              isLoading={isLoading}
              columns={columns}
              dataFetcher={dataFetcher}
              rowIdAccessor={(row) => row.deductionId}
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
