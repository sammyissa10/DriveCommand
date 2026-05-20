/**
 * Facilities Grid Column Definitions
 *
 * Column config following DataGrid DESIGN.md:
 * - Every column declares dataType
 * - StatusBadge for all status/type pills
 * - Lucide icons with strokeWidth={1.5}
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import type { FacilityRow } from './types';

const FACILITY_TYPE_LABELS: Record<string, string> = {
  shipper: 'Shipper',
  receiver: 'Receiver',
  terminal: 'Terminal',
  fuel_stop: 'Fuel Stop',
  other: 'Other',
};

const FACILITY_TYPE_VARIANTS: Record<string, 'info' | 'success' | 'purple' | 'warning' | 'neutral'> = {
  shipper: 'info',
  receiver: 'success',
  terminal: 'purple',
  fuel_stop: 'warning',
  other: 'neutral',
};

export const facilitiesColumns: ColumnDef<FacilityRow, unknown>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 180,
    },
    cell: ({ row }) => (
      <Link
        href={`/carrier/facilities/${row.original.id}`}
        className="font-medium text-foreground hover:text-primary transition-colors"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'facilityType',
    accessorKey: 'facilityType',
    header: 'Type',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row }) => {
      const type = row.original.facilityType;
      if (!type) return <span className="text-muted-foreground">—</span>;
      const variant = FACILITY_TYPE_VARIANTS[type] ?? 'neutral';
      const label = FACILITY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
  {
    id: 'location',
    accessorFn: (row) => {
      if (row.city && row.state) return `${row.city}, ${row.state}`;
      return row.city ?? row.state ?? null;
    },
    header: 'Location',
    meta: {
      dataType: 'text',
      minWidth: 140,
    },
    cell: ({ getValue }) => {
      const value = getValue() as string | null;
      return value ? (
        <span className="text-foreground">{value}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: 'contactName',
    accessorFn: (row) => {
      if (row.contacts && row.contacts.length > 0) return row.contacts[0].name;
      return row.contactName ?? null;
    },
    header: 'Contact',
    meta: {
      dataType: 'text',
      minWidth: 140,
    },
    cell: ({ getValue }) => {
      const value = getValue() as string | null;
      return value ? (
        <span className="text-foreground">{value}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: 'notes',
    accessorKey: 'notes',
    header: 'Notes',
    meta: {
      dataType: 'text',
      minWidth: 200,
    },
    cell: ({ row }) => {
      const notes = row.original.notes;
      if (!notes) return <span className="text-muted-foreground">—</span>;
      const truncated = notes.length > 60 ? notes.slice(0, 60) + '…' : notes;
      return <span className="text-muted-foreground">{truncated}</span>;
    },
  },
];
