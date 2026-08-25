/**
 * Trucks Grid Column Definitions
 *
 * Column config following DataGrid DESIGN.md:
 * - Every column declares dataType
 * - StatusBadge for all status/type pills
 * - Expiration dates with urgency badges
 * - VIN displayed in monospace, NOT editable
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDateOnlyShort, daysUntilDateOnly } from '@/lib/utils/date';
import { StatusBadge } from '@/components/data-grid/shell';
import { SamplePill } from '@/components/onboarding/sample-pill';
import type { TruckRow } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// These expiry columns are `@db.Date`. Formatting one with
// `new Date(x).toLocaleDateString()` renders the PREVIOUS day in any negative
// UTC offset, and subtracting milliseconds from `now` reports a licence
// expiring TODAY as already expired. Both rules live in lib/utils/date.ts
// now — see quick-541.

function formatOdometer(miles: number | null): string {
  if (miles == null) return '—';
  return miles.toLocaleString() + ' mi';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
  cargo_van: 'Cargo Van',
  sprinter_van: 'Sprinter Van',
  pickup: 'Pickup Truck',
  car: 'Car',
};

const TRUCK_TYPE_VARIANTS: Record<string, 'info' | 'success' | 'purple' | 'warning' | 'neutral'> = {
  semi: 'info',
  box_truck: 'warning',
  flatbed: 'warning',
  reefer: 'info',
  tanker: 'purple',
  day_cab: 'success',
  straight_truck: 'neutral',
  cargo_van: 'success',
  sprinter_van: 'info',
  pickup: 'neutral',
  car: 'neutral',
};

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  maintenance: 'warning',
  out_of_service: 'danger',
  inactive: 'neutral',
};

// ---------------------------------------------------------------------------
// Expiration Cell Renderer
// ---------------------------------------------------------------------------

function ExpirationCell({ date }: { date: Date | string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;

  const days = daysUntilDateOnly(date);
  const formatted = formatDateOnlyShort(date);

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

export const trucksColumns: ColumnDef<TruckRow, unknown>[] = [
  {
    id: 'unitNumber',
    accessorKey: 'unitNumber',
    header: 'Identifier',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 140,
    },
    cell: ({ row }) => {
      const t = row.original;
      const regDays = daysUntilDateOnly(t.registrationExpiry);
      const licDays = daysUntilDateOnly(t.licenseExpiry);
      const hasAlert = (regDays !== null && regDays < 30) || (licDays !== null && licDays < 30);

      return (
        <div className="flex items-center gap-2">
          {hasAlert && (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-status-danger-foreground" strokeWidth={1.5} />
          )}
          <div>
            <div className="flex items-center gap-1">
              <Link
                href={`/carrier/fleet/trucks/${t.id}`}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                {t.unitNumber}
              </Link>
              {t.isSample && <SamplePill />}
            </div>
            {t.displayName && t.displayName !== t.unitNumber && (
              <p className="text-xs text-muted-foreground">{t.displayName}</p>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: 'vehicleId',
    accessorKey: 'vehicleId',
    header: 'Vehicle ID',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.vehicleId}</span>
    ),
  },
  {
    id: 'vin',
    accessorKey: 'vin',
    header: 'VIN',
    meta: {
      dataType: 'text',
      editable: false, // VIN should NEVER be inline-editable
      minWidth: 180,
    },
    cell: ({ row }) => {
      const vin = row.original.vin;
      return vin ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">{vin}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: 'yearMakeModel',
    accessorFn: (row) => [row.year, row.make, row.model].filter(Boolean).join(' ') || null,
    header: 'Year / Make / Model',
    meta: {
      dataType: 'text',
      minWidth: 180,
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
    id: 'truckType',
    accessorKey: 'truckType',
    header: 'Type',
    meta: {
      dataType: 'text',
      minWidth: 110,
    },
    cell: ({ row }) => {
      const type = row.original.truckType;
      const variant = TRUCK_TYPE_VARIANTS[type] ?? 'neutral';
      const label = TRUCK_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
  {
    id: 'currentOdometerMiles',
    accessorKey: 'currentOdometerMiles',
    header: 'Odometer',
    meta: {
      dataType: 'number',
      minWidth: 100,
    },
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {formatOdometer(row.original.currentOdometerMiles)}
      </span>
    ),
  },
  {
    id: 'registrationExpiry',
    accessorKey: 'registrationExpiry',
    header: 'Reg. Expiry',
    meta: {
      dataType: 'date',
      minWidth: 130,
    },
    cell: ({ row }) => <ExpirationCell date={row.original.registrationExpiry} />,
  },
  {
    id: 'licenseExpiry',
    accessorKey: 'licenseExpiry',
    header: 'License Expiry',
    meta: {
      dataType: 'date',
      minWidth: 130,
    },
    cell: ({ row }) => <ExpirationCell date={row.original.licenseExpiry} />,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      dataType: 'text',
      minWidth: 120,
    },
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = STATUS_VARIANTS[status] ?? 'neutral';
      const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return <StatusBadge variant={variant}>{label}</StatusBadge>;
    },
  },
];
