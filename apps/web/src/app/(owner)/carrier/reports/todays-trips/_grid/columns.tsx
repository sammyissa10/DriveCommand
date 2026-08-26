/**
 * Phase 11 — Today's Trips report columns.
 *
 * Section 13's eleven columns: trip, client, driver, truck, planned start,
 * actual start, inspection status, stops done over total, on-time, exceptions,
 * location.
 *
 * The twelfth column is hidden and is the one that does the work: `attention`
 * carries the numeric `attentionRank`, and the grid's initial sort is that
 * column ascending. Section 13's default order — failed inspection, not
 * started, behind schedule, on track, completed — is then produced by the stock
 * ascending sorter over a number, with no custom `sortingFn` buried in a table
 * config. See ATTENTION_RANK for why a number rather than a comparator.
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import { InspectionBadge, OnTimeBadge } from '@/components/tracking/BoardBadges';
import { ATTENTION_COPY } from '@/lib/carrier/board-constants';
import type { TripAttention } from '@/lib/carrier/board-status';
import type { TodaysTripRow } from '@/lib/carrier/board-view';

/**
 * `ATTENTION_COPY` is `as const`, so indexing it with the wider `TripAttention`
 * union needs the map typed rather than inferred. Typed here rather than
 * loosening the constant, which would give up the literal types the badge
 * registries rely on.
 */
const ATTENTION_LABELS: Record<TripAttention, { label: string; description: string }> =
  ATTENTION_COPY;

/**
 * `scheduled_departure` and `actual_departure` are `@db.Timestamptz` — real
 * instants — so rendering them in the viewer's local zone is CORRECT, and
 * `formatDateOnly` would be the inverse of the quick-541 bug rather than a fix
 * for it. Only `@db.Date` columns need the date-only helpers.
 */
function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const TRIP_STATUS_TONE: Record<
  string,
  'success' | 'warning' | 'info' | 'neutral' | 'danger' | 'unassigned'
> = {
  planned: 'neutral',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'danger',
  tonu: 'warning',
};

export const todaysTripsColumns: ColumnDef<TodaysTripRow, unknown>[] = [
  {
    id: 'attention',
    accessorKey: 'attentionRank',
    header: 'Attention',
    meta: { dataType: 'number', minWidth: 150 },
    cell: ({ row }) => (
      <span
        className="text-xs text-muted-foreground"
        title={ATTENTION_LABELS[row.original.attention].description}
      >
        {ATTENTION_LABELS[row.original.attention].label}
      </span>
    ),
  },
  {
    id: 'reference',
    accessorKey: 'reference',
    header: 'Trip',
    meta: { dataType: 'text', freezable: true, defaultFrozen: true, minWidth: 130 },
    cell: ({ row }) => (
      <Link
        href={`/carrier/trips/${row.original.id}`}
        className="font-medium hover:underline"
        style={{ fontFamily: 'var(--grid-font-data)' }}
      >
        {row.original.reference}
      </Link>
    ),
  },
  {
    id: 'clientName',
    accessorKey: 'clientName',
    header: 'Client',
    meta: { dataType: 'text', minWidth: 150 },
    cell: ({ getValue }) => <span>{(getValue() as string | null) ?? '—'}</span>,
  },
  {
    id: 'driverName',
    accessorKey: 'driverName',
    header: 'Driver',
    meta: { dataType: 'text', minWidth: 150 },
    cell: ({ getValue }) => <span>{(getValue() as string | null) ?? 'Unassigned'}</span>,
  },
  {
    id: 'truckLabel',
    accessorKey: 'truckLabel',
    header: 'Truck',
    meta: { dataType: 'text', minWidth: 110 },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {(getValue() as string | null) ?? '—'}
      </span>
    ),
  },
  {
    id: 'plannedStart',
    accessorKey: 'plannedStart',
    header: 'Planned start',
    meta: { dataType: 'date', minWidth: 120 },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {formatInstant(getValue() as string | null)}
      </span>
    ),
  },
  {
    id: 'actualStart',
    accessorKey: 'actualStart',
    header: 'Actual start',
    meta: { dataType: 'date', minWidth: 120 },
    cell: ({ getValue }) => {
      const value = getValue() as string | null;
      return (
        <span
          className={value ? undefined : 'italic text-muted-foreground'}
          style={{ fontFamily: 'var(--grid-font-data)' }}
        >
          {value ? formatInstant(value) : 'Not started'}
        </span>
      );
    },
  },
  {
    id: 'inspection',
    accessorKey: 'inspection',
    header: 'Inspection',
    meta: { dataType: 'text', minWidth: 150 },
    // Colour AND icon AND text — Section 15, and item 6 verbatim.
    cell: ({ row }) => <InspectionBadge state={row.original.inspection} />,
  },
  {
    id: 'stops',
    // Sorts by how much is LEFT, not by the raw completed count: a trip on 2/12
    // needs more attention than one on 7/9, and sorting on `completed` alone
    // puts them the wrong way round.
    accessorFn: (row) => row.stopsTotal - row.stopsCompleted,
    header: 'Stops',
    meta: { dataType: 'number', minWidth: 90 },
    cell: ({ row }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {row.original.stopsCompleted} / {row.original.stopsTotal}
      </span>
    ),
  },
  {
    id: 'onTime',
    accessorKey: 'onTime',
    header: 'On time',
    meta: { dataType: 'text', minWidth: 160 },
    cell: ({ row }) => <OnTimeBadge state={row.original.onTime} />,
  },
  {
    id: 'exceptionCount',
    accessorKey: 'exceptionCount',
    header: 'Exceptions',
    meta: { dataType: 'number', minWidth: 110 },
    cell: ({ getValue }) => {
      const n = getValue() as number;
      return n === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <StatusBadge variant="warning">{n}</StatusBadge>
      );
    },
  },
  {
    id: 'currentLocation',
    accessorKey: 'currentLocation',
    header: 'Current location',
    meta: { dataType: 'text', minWidth: 220 },
    cell: ({ getValue }) => <span className="truncate">{getValue() as string}</span>,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: { dataType: 'text', minWidth: 110 },
    cell: ({ getValue }) => {
      const status = getValue() as string;
      return (
        <StatusBadge variant={TRIP_STATUS_TONE[status] ?? 'neutral'}>
          {status === 'tonu' ? 'TONU' : status.replace('_', ' ')}
        </StatusBadge>
      );
    },
  },
];
