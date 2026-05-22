'use client';

/**
 * SettlementHistoryReport — Migrated to DataGrid.
 * Full all-status settlement history, sortable + paginated.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta, ServerFetchParams, ServerFetchResult } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney, fmtDate } from './format';

interface SettlementHistoryRow {
  id: string;
  driverId: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  paidAt: string | null;
  isAnomaly: boolean;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  statusCounts: Record<string, number>;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: SettlementHistoryRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

const STATUS_ORDER = ['DRAFT', 'PENDING_REVIEW', 'FINALIZED', 'PAID', 'VOIDED'];

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="secondary" className="text-xs">
          Draft
        </Badge>
      );
    case 'PENDING_REVIEW':
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs">
          Pending Review
        </Badge>
      );
    case 'FINALIZED':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs">
          Finalized
        </Badge>
      );
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">
          Paid
        </Badge>
      );
    case 'VOIDED':
      return (
        <Badge variant="destructive" className="text-xs">
          Voided
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {status}
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<SettlementHistoryRow, unknown>[] = [
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
    id: 'periodEnd',
    accessorKey: 'periodEnd',
    header: 'Period',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {fmtDate(row.original.periodStart)} – {fmtDate(row.original.periodEnd)}
      </span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    enableSorting: true,
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'DRAFT', label: 'Draft' },
        { value: 'PENDING_REVIEW', label: 'Pending Review' },
        { value: 'FINALIZED', label: 'Finalized' },
        { value: 'PAID', label: 'Paid' },
        { value: 'VOIDED', label: 'Voided' },
      ],
    } as DataGridColumnMeta,
  },
  {
    id: 'grossTaxable',
    accessorKey: 'grossTaxable',
    header: 'Gross Taxable',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.grossTaxable)}
      </span>
    ),
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'grossNonTaxable',
    accessorKey: 'grossNonTaxable',
    header: 'Gross Non-Tax',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.grossNonTaxable)}
      </span>
    ),
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'totalDeductions',
    accessorKey: 'totalDeductions',
    header: 'Deductions',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {fmtMoney(row.original.totalDeductions)}
      </span>
    ),
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'netPay',
    accessorKey: 'netPay',
    header: 'Net Pay',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm font-semibold">
        {fmtMoney(row.original.netPay)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'paidAt',
    accessorKey: 'paidAt',
    header: 'Paid At',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.paidAt ? fmtDate(row.original.paidAt) : '—'}
      </span>
    ),
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'isAnomaly',
    accessorKey: 'isAnomaly',
    header: 'Anomaly',
    cell: ({ row }) =>
      row.original.isAnomaly ? (
        <Badge variant="destructive" className="text-xs">
          Anomaly
        </Badge>
      ) : null,
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ],
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettlementHistoryReport({ period, customStart, customEnd, driverIds }: Props) {
  const [headerData, setHeaderData] = useState<{
    bigNumber: string;
    deltaPct: number | null;
    statusCounts: Record<string, number>;
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
        const res = await fetch(`/api/driver-pay/reports/settlement-history?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as ApiResult;
          setHeaderData({
            bigNumber: json.bigNumber,
            deltaPct: json.deltaPct,
            statusCounts: json.statusCounts,
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
    async (params: ServerFetchParams): Promise<ServerFetchResult<SettlementHistoryRow>> => {
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

      const res = await fetch(`/api/driver-pay/reports/settlement-history?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch settlement history');
      }

      const json = (await res.json()) as ApiResult;
      return { rows: json.rows, total: json.totalCount };
    },
    [period, customStart, customEnd, driverIds]
  );

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'settlement-history-report',
    columns,
    dataFetcher,
    rowIdAccessor: (row) => row.id,
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
          <CardTitle className="text-base font-semibold">Settlement History</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/settlement-history" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialLoading ? (
          <ReportTableSkeleton rows={5} columns={9} />
        ) : isEmpty ? (
          <>
            {headerData && (
              <BigNumberHero
                value={fmtMoney(headerData.bigNumber)}
                subtitle="Total paid this period"
                deltaPct={headerData.deltaPct}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            {headerData && (
              <>
                <BigNumberHero
                  value={fmtMoney(headerData.bigNumber)}
                  subtitle="Total paid this period"
                  deltaPct={headerData.deltaPct}
                />

                {/* Status count chips */}
                <div className="flex flex-wrap gap-2">
                  {STATUS_ORDER.filter(
                    (s) => headerData.statusCounts[s] !== undefined
                  ).map((status) => (
                    <div key={status} className="flex items-center gap-1">
                      <StatusBadge status={status} />
                      <span className="text-sm font-medium">
                        {headerData.statusCounts[status]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <GridShell
              gridId="settlement-history-report"
              table={table}
              rows={rows}
              isLoading={isLoading}
              columns={columns}
              dataFetcher={dataFetcher}
              rowIdAccessor={(row) => row.id}
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
