/**
 * Column definitions for Routes DataGrid
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import type { RouteRow } from './types';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const routesColumns: ColumnDef<RouteRow, unknown>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Route Name',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 150,
    },
    cell: ({ row }) => (
      <Link
        href={`/routes/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'origin',
    accessorKey: 'origin',
    header: 'Origin',
    meta: {
      dataType: 'text',
      minWidth: 140,
    },
    cell: ({ getValue }) => (
      <span className="truncate">{(getValue() as string | null) || '—'}</span>
    ),
  },
  {
    id: 'destination',
    accessorKey: 'destination',
    header: 'Destination',
    meta: {
      dataType: 'text',
      minWidth: 140,
    },
    cell: ({ getValue }) => (
      <span className="truncate">{(getValue() as string | null) || '—'}</span>
    ),
  },
  {
    id: 'scheduledDate',
    accessorKey: 'scheduledDate',
    header: 'Scheduled',
    meta: {
      dataType: 'date',
      minWidth: 120,
    },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {formatDate(getValue() as string | null)}
      </span>
    ),
  },
  {
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    meta: {
      dataType: 'text',
      minWidth: 130,
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
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ getValue }) => {
      const status = getValue() as string;
      const statusMap: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
        planned: 'neutral',
        in_progress: 'info',
        completed: 'success',
        cancelled: 'danger',
      };
      return (
        <StatusBadge variant={statusMap[status] || 'neutral'}>
          {status.replace('_', ' ')}
        </StatusBadge>
      );
    },
  },
];
