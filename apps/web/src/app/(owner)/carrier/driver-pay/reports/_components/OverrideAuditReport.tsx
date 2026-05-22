'use client';

/**
 * OverrideAuditReport — Migrated to DataGrid.
 * Override audit trail with dispatcher summary, paginated.
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
import { fmtDate } from './format';

interface OverrideAuditRow {
  assignmentId: string;
  loadId: string;
  referenceNumber: string | null;
  driverId: string;
  driverName: string;
  overrideReason: string;
  createdBy: string | null;
  createdAt: string;
  payType: string | null;
  baseRate: string | null;
  rateUnit: string | null;
}

interface ByDispatcher {
  createdBy: string | null;
  count: number;
}

interface ApiResult {
  bigNumber: number;
  deltaPct: number | null;
  priorCount: number;
  byDispatcher: ByDispatcher[];
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OverrideAuditRow[];
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

const columns: ColumnDef<OverrideAuditRow, unknown>[] = [
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
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.driverName}</span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'overrideReason',
    accessorKey: 'overrideReason',
    header: 'Reason',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground max-w-xs truncate block">
        {row.original.overrideReason}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'payType',
    accessorKey: 'payType',
    header: 'Pay Type',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.payType ?? '—'}</span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'baseRate',
    accessorKey: 'baseRate',
    header: 'Base Rate',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {row.original.baseRate ?? '—'}
      </span>
    ),
    meta: {
      dataType: 'number',
    } as DataGridColumnMeta,
  },
  {
    id: 'rateUnit',
    accessorKey: 'rateUnit',
    header: 'Rate Unit',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.rateUnit ?? '—'}</span>
    ),
  },
  {
    id: 'createdBy',
    accessorKey: 'createdBy',
    header: 'Created By',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {row.original.createdBy ? row.original.createdBy.slice(0, 8) + '…' : '—'}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created At',
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

export function OverrideAuditReport({ period, customStart, customEnd, driverIds }: Props) {
  const [headerData, setHeaderData] = useState<{
    bigNumber: number;
    deltaPct: number | null;
    byDispatcher: ByDispatcher[];
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
        const res = await fetch(`/api/driver-pay/reports/override-audit?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as ApiResult;
          setHeaderData({
            bigNumber: json.bigNumber,
            deltaPct: json.deltaPct,
            byDispatcher: json.byDispatcher,
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
    async (params: ServerFetchParams): Promise<ServerFetchResult<OverrideAuditRow>> => {
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

      const res = await fetch(`/api/driver-pay/reports/override-audit?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch override audit data');
      }

      const json = (await res.json()) as ApiResult;
      return { rows: json.rows, total: json.totalCount };
    },
    [period, customStart, customEnd, driverIds]
  );

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'override-audit-report',
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
          <CardTitle className="text-base font-semibold">Override Audit</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/override-audit" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialLoading ? (
          <ReportTableSkeleton rows={5} columns={8} />
        ) : isEmpty ? (
          <>
            {headerData && (
              <BigNumberHero
                value={String(headerData.bigNumber)}
                subtitle="Pay overrides this period"
                deltaPct={headerData.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            {headerData && (
              <>
                <BigNumberHero
                  value={String(headerData.bigNumber)}
                  subtitle="Pay overrides this period"
                  deltaPct={headerData.deltaPct}
                  deltaInvertedForSpend
                />

                {/* Dispatcher summary */}
                {headerData.byDispatcher.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-muted-foreground self-center">
                      Overrides by dispatcher:
                    </span>
                    {headerData.byDispatcher.map((d, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {d.createdBy ? d.createdBy.slice(0, 8) + '…' : 'Unknown'}: {d.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}

            <GridShell
              gridId="override-audit-report"
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
