'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { formatPayPeriodDate } from '@/lib/utils/date';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettlementRow {
  id: string;
  settlementReference: string | null;
  driverId: string;
  driver: { firstName: string; lastName: string } | null;
  periodStart: string;
  periodEnd: string;
  netPay: string;
  status: string;
  createdAt: string;
}

interface Props {
  settlements: SettlementRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Draft
        </Badge>
      );
    case 'FINALIZED':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Finalized
        </Badge>
      );
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Paid
        </Badge>
      );
    case 'VOIDED':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 line-through">
          Voided
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(val: string): string {
  const n = parseFloat(val);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<SettlementRow, unknown>[] = [
  {
    id: 'settlementReference',
    accessorKey: 'settlementReference',
    header: 'Reference',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.settlementReference ?? row.original.id.slice(0, 8)}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'driver',
    accessorFn: (row) => row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : row.driverId.slice(0, 8),
    header: 'Driver',
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.driver
          ? `${row.original.driver.firstName} ${row.original.driver.lastName}`
          : row.original.driverId.slice(0, 8)}
      </span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'period',
    accessorKey: 'periodEnd',
    header: 'Period',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatPayPeriodDate(row.original.periodStart, { month: 'short', day: 'numeric', year: 'numeric' })} – {formatPayPeriodDate(row.original.periodEnd, { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'netPay',
    accessorKey: 'netPay',
    header: 'Net Pay',
    cell: ({ row }) => (
      <span className="text-right font-semibold">
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
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(row.original.createdAt)}
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

export function SettlementListTable({
  settlements,
  totalCount,
  page,
  pageSize,
}: Props) {
  const router = useRouter();

  // Use the data grid hook
  const { table, isLoading, urlState } = useDataGrid({
    gridId: 'settlement-list',
    columns,
    data: settlements,
    rowIdAccessor: (row) => row.id,
    initialPageSize: pageSize,
    enableUrlSync: true,
  });

  const rows = table.getRowModel().rows;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Navigate to detail page on row double-click
  const handleRowDoubleClick = (row: SettlementRow) => {
    router.push(`/carrier/driver-pay/settlements/${row.id}`);
  };

  // Empty state
  if (settlements.length === 0 && totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">No settlements yet</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Run your first Friday settlement to generate driver pay statements.
        </p>
        <Button className="mt-6" onClick={() => router.push('/carrier/driver-pay/settlements/generate')}>
          Generate Settlements
        </Button>
      </div>
    );
  }

  return (
    <GridShell
      gridId="settlement-list"
      table={table}
      rows={rows}
      isLoading={isLoading}
      onRowDoubleClick={handleRowDoubleClick}
      searchPlaceholder="Search settlements..."
      search={urlState.search}
      onSearchChange={urlState.setSearch}
      exportFilename="settlements-export"
      columns={columns}
      pagination={{
        pageIndex: page - 1,
        pageSize,
        pageCount: totalPages,
        totalRows: totalCount,
        canPreviousPage: page > 1,
        canNextPage: page < totalPages,
        previousPage: () => urlState.setPage(urlState.page - 1),
        nextPage: () => urlState.setPage(urlState.page + 1),
        setPageSize: urlState.setPageSize,
      }}
    />
  );
}
