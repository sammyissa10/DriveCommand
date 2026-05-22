'use client';

/**
 * AccessorialSpendReport — Migrated to DataGrid.
 * Accessorial spend grouped by client/contract.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney } from './format';

interface AccessorialSpendRow {
  clientId: string | null;
  clientName: string;
  contractId: string | null;
  contractName: string | null;
  totalAmount: string;
  componentCount: number;
  avgAmount: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  rows: AccessorialSpendRow[];
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

const columns: ColumnDef<AccessorialSpendRow, unknown>[] = [
  {
    id: 'clientName',
    accessorKey: 'clientName',
    header: 'Client',
    cell: ({ row }) => (
      <span className="font-medium">{row.original.clientName}</span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'contractName',
    accessorKey: 'contractName',
    header: 'Contract',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.contractName ?? '—'}
      </span>
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
    id: 'componentCount',
    accessorKey: 'componentCount',
    header: 'Count',
    cell: ({ row }) => (
      <span className="text-right text-sm">{row.original.componentCount}</span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'avgAmount',
    accessorKey: 'avgAmount',
    header: 'Avg',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.avgAmount)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccessorialSpendReport({ period, customStart, customEnd, driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (customStart) params.set('customStart', customStart);
      if (customEnd) params.set('customEnd', customEnd);
      if (driverIds?.length) {
        for (const id of driverIds) params.append('driverIds', id);
      }
      const res = await fetch(`/api/driver-pay/reports/accessorial-spend?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, driverIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Use data grid for the table
  const { table, isLoading: gridLoading } = useDataGrid({
    gridId: 'accessorial-spend-report',
    columns,
    data: data?.rows ?? [],
    rowIdAccessor: (row) => row.clientId ?? `no-client-${row.clientName}`,
    initialPageSize: 25,
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
          <CardTitle className="text-base font-semibold">Accessorial Spend by Client</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/accessorial-spend" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={5} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle="Total accessorial spend this period"
                deltaPct={data.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle="Total accessorial spend this period"
              deltaPct={data.deltaPct}
              deltaInvertedForSpend
            />
            <GridShell
              gridId="accessorial-spend-report"
              table={table}
              rows={rows}
              isLoading={gridLoading}
              columns={columns}
              pagination={{
                pageIndex,
                pageSize,
                pageCount,
                totalRows: data.rows.length,
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
