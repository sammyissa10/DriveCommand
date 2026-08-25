'use client';

/**
 * SettlementsYtdTable — Migrated to DataGrid.
 * YTD settlements table for driver detail report.
 */

import { type ColumnDef } from '@tanstack/react-table';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { formatDateOnly } from '@/lib/utils/date';

interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  paidAt: string | null;
}

interface SettlementsYtdTableProps {
  settlements: Settlement[];
}

function formatMoney(val: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(val),
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'MMM d, yyyy');
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

const columns: ColumnDef<Settlement, unknown>[] = [
  {
    id: 'period',
    accessorKey: 'periodEnd',
    header: 'Period',
    cell: ({ row }) => (
      <span className="text-sm">
        {formatDateOnly(row.original.periodStart, { month: 'short', day: 'numeric' })} – {formatDateOnly(row.original.periodEnd, { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'grossTaxable',
    accessorKey: 'grossTaxable',
    header: 'Gross Taxable',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">{formatMoney(row.original.grossTaxable)}</span>
    ),
    enableSorting: true,
    meta: {
      dataType: 'currency',
    } as DataGridColumnMeta,
  },
  {
    id: 'grossNonTaxable',
    accessorKey: 'grossNonTaxable',
    header: 'Gross Non-Tax',
    cell: ({ row }) => (
      <span className="text-right font-mono text-sm">{formatMoney(row.original.grossNonTaxable)}</span>
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
      <span className="text-right font-mono text-sm">{formatMoney(row.original.totalDeductions)}</span>
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
      <span className="text-right font-mono text-sm font-semibold">{formatMoney(row.original.netPay)}</span>
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
    id: 'paidAt',
    accessorKey: 'paidAt',
    header: 'Paid At',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.original.paidAt)}</span>
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

export function SettlementsYtdTable({ settlements }: SettlementsYtdTableProps) {
  const { table } = useDataGrid({
    gridId: 'driver-settlements-ytd',
    columns,
    data: settlements,
    rowIdAccessor: (row) => row.id,
    initialPageSize: 25,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <GridShell
      gridId="driver-settlements-ytd"
      table={table}
      rows={rows}
      columns={columns}
      pagination={{
        pageIndex,
        pageSize,
        pageCount,
        totalRows: settlements.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
      }}
    />
  );
}
