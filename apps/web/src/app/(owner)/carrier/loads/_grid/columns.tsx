/**
 * Column definitions for Loads DataGrid
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge, getStatusVariant } from '@/components/data-grid/shell';
import { SamplePill } from '@/components/onboarding/sample-pill';
import type { LoadRow } from './types';

function formatCurrency(value: string | null | number): string {
  if (value == null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

const LOAD_TYPE_LABELS: Record<string, string> = {
  ftl: 'FTL',
  ltl: 'LTL',
  partial: 'Partial',
  expedited: 'Expedited',
  intermodal: 'Intermodal',
};

export const loadsColumns: ColumnDef<LoadRow, unknown>[] = [
  {
    id: 'referenceNumber',
    accessorKey: 'referenceNumber',
    header: 'Reference #',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 140,
    },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/carrier/loads/${row.original.id}`}
          className="font-medium hover:underline"
          style={{ fontFamily: 'var(--grid-font-data)' }}
        >
          {row.original.referenceNumber}
        </Link>
        {row.original.isSample && <SamplePill />}
      </div>
    ),
  },
  {
    id: 'clientName',
    accessorKey: 'clientName',
    header: 'Client',
    meta: {
      dataType: 'text',
      minWidth: 150,
    },
    cell: ({ getValue }) => (
      <span className="truncate">{getValue() as string}</span>
    ),
  },
  {
    id: 'dispatchNumber',
    accessorKey: 'dispatchNumber',
    header: 'Dispatch #',
    meta: {
      dataType: 'text',
      minWidth: 120,
    },
    cell: ({ row }) => {
      const dispatchId = row.original.dispatchId;
      const dispatchNumber = row.original.dispatchNumber;
      if (!dispatchId) return <span className="text-muted-foreground">—</span>;
      return (
        <Link
          href={`/carrier/dispatches/${dispatchId}`}
          className="hover:underline"
          style={{ fontFamily: 'var(--grid-font-data)' }}
        >
          {dispatchNumber || dispatchId.slice(0, 8)}
        </Link>
      );
    },
  },
  {
    id: 'loadType',
    accessorKey: 'loadType',
    header: 'Type',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ getValue }) => {
      const type = getValue() as string;
      return (
        <span className="text-sm">
          {LOAD_TYPE_LABELS[type] || type}
        </span>
      );
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      dataType: 'text',
      minWidth: 110,
    },
    cell: ({ getValue }) => {
      const status = getValue() as string;
      const statusMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'delivered' | 'purple'> = {
        pending: 'neutral',
        in_transit: 'info',
        delivered: 'delivered',
        cancelled: 'danger',
        invoiced: 'purple',
      };
      return (
        <StatusBadge variant={statusMap[status] || 'neutral'}>
          {status.replace('_', ' ')}
        </StatusBadge>
      );
    },
  },
  {
    id: 'totalRevenue',
    accessorKey: 'totalRevenue',
    header: 'Revenue',
    meta: {
      dataType: 'currency',
      minWidth: 110,
    },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {formatCurrency(getValue() as string | null)}
      </span>
    ),
  },
];
