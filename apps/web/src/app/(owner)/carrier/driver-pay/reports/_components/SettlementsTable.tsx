'use client';

/**
 * SettlementsTable — Migrated to DataGrid.
 * Fetches /api/driver-pay/reports/settlements with pagination + sorting.
 * Displays anomaly badge when isAnomaly=true.
 */

import React from 'react';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta, ServerFetchParams, ServerFetchResult } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

interface SettlementRow {
  id: string;
  driverId: string;
  driverName: string | null;
  periodStart: string;
  periodEnd: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  paidAt: string | null;
  isAnomaly: boolean;
}

interface InitialQuery {
  period: string;
  driverIds?: string[];
  employmentType?: string;
  status?: string;
}

interface Props {
  initialQuery: InitialQuery;
}

function formatMoney(val: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(val),
  );
}

function formatPeriod(start: string, end: string): string {
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d')}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary">Draft</Badge>;
    case 'FINALIZED':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Finalized</Badge>;
    case 'PAID':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</Badge>;
    case 'VOIDED':
      return <Badge variant="destructive">Voided</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<SettlementRow, unknown>[] = [
  {
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    cell: ({ row }) => (
      <Link
        href={`/carrier/driver-pay/reports/${row.original.driverId}`}
        className="font-medium hover:underline"
      >
        {row.original.driverName ?? 'Unknown Driver'}
      </Link>
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
        {formatPeriod(row.original.periodStart, row.original.periodEnd)}
      </span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'grossTaxable',
    accessorKey: 'grossTaxable',
    header: 'Gross Taxable',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">
        {formatMoney(row.original.grossTaxable)}
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
        {formatMoney(row.original.grossNonTaxable)}
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
        {formatMoney(row.original.totalDeductions)}
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
        {formatMoney(row.original.netPay)}
      </span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
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
        { value: 'FINALIZED', label: 'Finalized' },
        { value: 'PAID', label: 'Paid' },
        { value: 'VOIDED', label: 'Voided' },
      ],
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

export function SettlementsTable({ initialQuery }: Props) {
  // Server-side data fetcher
  const dataFetcher = async (
    params: ServerFetchParams
  ): Promise<ServerFetchResult<SettlementRow>> => {
    const queryParams = new URLSearchParams({
      period: initialQuery.period,
      page: String(params.page + 1),
      pageSize: String(params.pageSize),
    });

    if (params.sort) {
      queryParams.set('sortBy', params.sort.field);
      queryParams.set('sortDir', params.sort.direction);
    }

    if (params.search) {
      queryParams.set('search', params.search);
    }

    if (initialQuery.driverIds?.length) {
      queryParams.set('driverIds', initialQuery.driverIds.join(','));
    }
    if (initialQuery.employmentType && initialQuery.employmentType !== 'ALL') {
      queryParams.set('employmentType', initialQuery.employmentType);
    }
    if (initialQuery.status && initialQuery.status !== 'ALL') {
      queryParams.set('status', initialQuery.status);
    }

    if (params.filters.length > 0) {
      queryParams.set('filters', JSON.stringify(params.filters));
    }

    const res = await fetch(`/api/driver-pay/reports/settlements?${queryParams.toString()}`);
    if (!res.ok) {
      throw new Error('Failed to fetch settlements');
    }

    const json = await res.json();
    return { rows: json.rows, total: json.total };
  };

  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'settlements-report',
    columns,
    dataFetcher,
    rowIdAccessor: (row) => row.id,
    initialPageSize: 25,
    enableUrlSync: true,
    enablePersistence: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Settlements</h2>
      </div>

      <GridShell
        gridId="settlements-report"
        table={table}
        rows={rows}
        isLoading={isLoading}
        searchPlaceholder="Search settlements..."
        search={urlState.search}
        onSearchChange={urlState.setSearch}
        exportFilename="settlements-report"
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
    </div>
  );
}
