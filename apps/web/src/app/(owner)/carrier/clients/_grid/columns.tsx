/**
 * Clients Grid Column Definitions
 *
 * Column config following DataGrid DESIGN.md:
 * - Every column declares dataType
 * - StatusBadge for all status pills
 * - Phone NOT editable (data entry errors costly)
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import { SamplePill } from '@/components/onboarding/sample-pill';
import type { ClientRow } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  inactive: 'warning',
  blocked: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blocked: 'Blocked',
};

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

export const clientsColumns: ColumnDef<ClientRow, unknown>[] = [
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
      <div className="flex items-center gap-1">
        <Link
          href={`/carrier/clients/${row.original.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.original.name}
        </Link>
        {row.original.isSample && <SamplePill />}
      </div>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = STATUS_VARIANTS[status] ?? 'neutral';
      const label = STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
  {
    id: 'primaryContact',
    accessorKey: 'mainContactName',
    header: 'Primary Contact',
    meta: {
      dataType: 'text',
      minWidth: 150,
    },
    cell: ({ row }) => {
      const contact = row.original.mainContactName;
      return contact ? (
        <span className="text-foreground">{contact}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: 'Email',
    meta: {
      dataType: 'text',
      minWidth: 180,
    },
    cell: ({ row }) => {
      const email = row.original.email;
      return email ? (
        <span className="text-foreground">{email}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
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
];
