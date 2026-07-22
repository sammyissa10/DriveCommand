/**
 * Drivers Grid Column Definitions
 *
 * Column config following DataGrid DESIGN.md:
 * - Every column declares dataType
 * - StatusBadge for all status/type pills
 * - CDL expiration with urgency badges
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import { SamplePill } from '@/components/onboarding/sample-pill';
import type { DriverRow } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAY_MODEL_LABELS: Record<string, string> = {
  per_mile: 'Per Mile',
  percentage: 'Percentage',
  flat_rate: 'Flat Rate',
  per_stop: 'Per Stop',
};

const PAY_MODEL_VARIANTS: Record<string, 'info' | 'purple' | 'warning' | 'success'> = {
  per_mile: 'info',
  percentage: 'purple',
  flat_rate: 'warning',
  per_stop: 'success',
};

const STATUS_VARIANTS: Record<string, 'success' | 'neutral' | 'danger'> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
};

// ---------------------------------------------------------------------------
// CDL Expiration Cell Renderer
// ---------------------------------------------------------------------------

function CDLExpirationCell({ date }: { date: Date | string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;

  const days = daysUntil(date);
  const formatted = formatDate(date);

  if (days === null) {
    return <span className="tabular-nums text-foreground">{formatted}</span>;
  }

  const variant = days < 0 ? 'danger' : days < 30 ? 'warning' : 'neutral';
  const badgeText =
    days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
      ? 'Today'
      : days < 30
      ? `${days}d`
      : null;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular-nums text-foreground">{formatted}</span>
      {badgeText && <StatusBadge variant={variant}>{badgeText}</StatusBadge>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

export const driversColumns: ColumnDef<DriverRow, unknown>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    header: 'Driver',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 180,
    },
    cell: ({ row }) => {
      const d = row.original;
      const days = daysUntil(d.cdlExpiry);
      const isNearExpiry = days !== null && days < 30;

      return (
        <div className="flex items-center gap-2">
          {isNearExpiry && (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-status-danger-foreground" strokeWidth={1.5} />
          )}
          <Link
            href={`/carrier/fleet/drivers/${d.id}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {d.firstName} {d.lastName}
          </Link>
          {d.isSample && <SamplePill />}
        </div>
      );
    },
  },
  {
    id: 'cdlClass',
    accessorKey: 'cdlClass',
    header: 'CDL Class',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row }) => {
      const cdlClass = row.original.cdlClass;
      return cdlClass ? (
        <StatusBadge variant="info">Class {cdlClass}</StatusBadge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: 'cdlExpiry',
    accessorKey: 'cdlExpiry',
    header: 'CDL Expiry',
    meta: {
      dataType: 'date',
      minWidth: 130,
    },
    cell: ({ row }) => <CDLExpirationCell date={row.original.cdlExpiry} />,
  },
  {
    id: 'payModel',
    accessorKey: 'payModel',
    header: 'Pay Model',
    meta: {
      dataType: 'text',
      minWidth: 110,
    },
    cell: ({ row }) => {
      const payModel = row.original.payModel;
      const variant = PAY_MODEL_VARIANTS[payModel] ?? 'neutral';
      const label = PAY_MODEL_LABELS[payModel] ?? payModel;
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
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
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = STATUS_VARIANTS[status] ?? 'neutral';
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
  {
    id: 'portalStatus',
    accessorKey: 'portalStatus',
    header: 'Portal Access',
    meta: {
      dataType: 'text',
      minWidth: 130,
    },
    cell: ({ row }) => {
      const portalStatus = row.original.portalStatus;
      if (portalStatus === 'active') return <StatusBadge variant="success">Active</StatusBadge>;
      if (portalStatus === 'invited') return <StatusBadge variant="warning">Invited · pending</StatusBadge>;
      return <span className="text-muted-foreground">—</span>;
    },
  },
];
