/**
 * Column definitions for Trips DataGrid
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import type { DispatchRow } from './types';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function extractDispatchNumber(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : null;
}

export const dispatchesColumns: ColumnDef<DispatchRow, unknown>[] = [
  {
    id: 'dispatchNumber',
    accessorFn: (row) => row.dispatchNumber || extractDispatchNumber(row.notes) || row.id.slice(0, 8),
    header: 'Dispatch #',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 120,
    },
    cell: ({ row }) => {
      const dispatchNum = row.original.dispatchNumber || extractDispatchNumber(row.original.notes) || row.original.id.slice(0, 8);
      return (
        <Link
          href={`/carrier/trips/${row.original.id}`}
          className="font-medium hover:underline"
          style={{ fontFamily: 'var(--grid-font-data)' }}
        >
          {dispatchNum}
        </Link>
      );
    },
  },
  {
    id: 'scheduledDate',
    accessorKey: 'scheduledDate',
    header: 'Date',
    meta: {
      dataType: 'date',
      minWidth: 110,
    },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {formatDate(getValue() as string)}
      </span>
    ),
  },
  {
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    meta: {
      dataType: 'text',
      minWidth: 140,
    },
    cell: ({ row }) => {
      const driverId = row.original.driverId;
      const driverName = row.original.driverName;
      if (!driverId) return <span className="text-muted-foreground">Unassigned</span>;
      return (
        <Link
          href={`/carrier/fleet/drivers/${driverId}`}
          className="hover:underline"
        >
          {driverName || 'Unknown'}
        </Link>
      );
    },
  },
  {
    id: 'truckUnit',
    accessorKey: 'truckUnit',
    header: 'Truck',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row }) => {
      const truckId = row.original.truckId;
      const truckUnit = row.original.truckUnit;
      if (!truckId) return <span className="text-muted-foreground">—</span>;
      return (
        <Link
          href={`/carrier/fleet/trucks/${truckId}`}
          className="hover:underline"
          style={{ fontFamily: 'var(--grid-font-data)' }}
        >
          {truckUnit || 'Unknown'}
        </Link>
      );
    },
  },
  {
    id: 'loadCount',
    accessorKey: 'loadCount',
    header: 'Loads',
    meta: {
      dataType: 'number',
      minWidth: 80,
    },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {getValue() as number}
      </span>
    ),
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
      const statusMap: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger' | 'unassigned'> = {
        planned: 'neutral',
        in_progress: 'info',
        completed: 'success',
        cancelled: 'danger',
        tonu: 'warning',
      };
      return (
        <StatusBadge variant={statusMap[status] || 'neutral'}>
          {status === 'tonu' ? 'TONU' : status.replace('_', ' ')}
        </StatusBadge>
      );
    },
  },
];
