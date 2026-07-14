'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  UnitChip,
  StatusPill,
  EmptyState,
  type StatusTone,
  type SegmentOption,
} from '@/components/ui/ds';
import { NewTruckSheet } from './NewTruckSheet';

/** A truck row, with its urgent meta line precomputed server-side. */
export interface TruckMobileRow {
  id: string;
  unitNumber: string;
  displayName: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  licensePlate: string | null;
  licenseState: string | null;
  truckType: string;
  /** Design-system status, derived server-side (ready/on_load/in_shop/…). */
  displayStatus: string;
  meta: string;
}

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
};

// Derived status → token tint + label (derivation happens server-side).
function statusMeta(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'ready':
      return { tone: 'success', label: 'Ready' };
    case 'on_load':
      return { tone: 'accent', label: 'On Load' };
    case 'in_shop':
      return { tone: 'warning', label: 'In Shop' };
    case 'out_of_service':
      return { tone: 'danger', label: 'Out of service' };
    case 'inactive':
      return { tone: 'neutral', label: 'Inactive' };
    default:
      return { tone: 'neutral', label: status.replace(/_/g, ' ') };
  }
}

function truckTitle(t: TruckMobileRow): string {
  if (t.make && t.model) return `${t.make} ${t.model}`;
  return t.make || t.model || t.displayName || `Unit ${t.unitNumber}`;
}

function truckSubline(t: TruckMobileRow): string {
  const plate = [t.licenseState, t.licensePlate].filter(Boolean).join(' ');
  const parts = [t.year ? String(t.year) : null, plate || null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : (TRUCK_TYPE_LABELS[t.truckType] ?? t.truckType);
}

/**
 * Suggest the next free unit number for the quick-create placeholder: the max
 * trailing integer across existing units, + 1. Falls back to fleet size + 1 when
 * no unit number ends in digits.
 */
function nextUnitNumber(trucks: TruckMobileRow[]): string {
  let max = 0;
  let sawNumeric = false;
  for (const t of trucks) {
    const m = t.unitNumber.match(/(\d+)\s*$/);
    if (m) {
      sawNumeric = true;
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return String(sawNumeric ? max + 1 : trucks.length + 1);
}

type TruckFilter = 'all' | 'ready' | 'on_load' | 'in_shop';

const FILTER_OPTIONS: SegmentOption<TruckFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'On Load', value: 'on_load' },
  { label: 'Shop', value: 'in_shop' },
];

/**
 * Trucks Overview — mobile-web design system view (carrier fleet).
 * Rendered only at mobile widths; the desktop grid stays on `lg+`.
 */
export function TrucksMobile({
  trucks,
  canCreate,
}: {
  trucks: TruckMobileRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TruckFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const suggestedUnit = useMemo(() => nextUnitNumber(trucks), [trucks]);

  // KPI counts are full-list aggregates → equal the filtered row counts.
  const counts = useMemo(() => {
    let ready = 0;
    let onLoad = 0;
    let inShop = 0;
    for (const t of trucks) {
      if (t.displayStatus === 'ready') ready += 1;
      else if (t.displayStatus === 'on_load') onLoad += 1;
      else if (t.displayStatus === 'in_shop') inShop += 1;
    }
    return { ready, onLoad, inShop };
  }, [trucks]);

  const visible = useMemo(() => {
    let list = trucks;
    if (filter !== 'all') list = list.filter((t) => t.displayStatus === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.unitNumber.toLowerCase().includes(q) ||
          (t.vin?.toLowerCase().includes(q) ?? false) ||
          (t.licensePlate?.toLowerCase().includes(q) ?? false) ||
          (t.make?.toLowerCase().includes(q) ?? false) ||
          (t.model?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
    );
  }, [trucks, filter, query]);

  const isFiltering = query.trim().length > 0 || filter !== 'all';
  const countLabel = `${trucks.length} truck${trucks.length === 1 ? '' : 's'}`;

  function setFilterToggle(next: TruckFilter) {
    setFilter((f) => (f === next ? 'all' : next));
  }

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Trucks"
        subtitle={countLabel}
        onAdd={canCreate ? () => setCreateOpen(true) : undefined}
        addLabel="Add truck"
      />

      <div className="space-y-3">
        <KPIRow>
          <KPICard
            value={counts.ready}
            label="Ready"
            tone="success"
            active={filter === 'ready'}
            onClick={() => setFilterToggle('ready')}
          />
          <KPICard
            value={counts.onLoad}
            label="On Load"
            tone="accent"
            active={filter === 'on_load'}
            onClick={() => setFilterToggle('on_load')}
          />
          <KPICard
            value={counts.inShop}
            label="In Shop"
            tone="warning"
            active={filter === 'in_shop'}
            onClick={() => setFilterToggle('in_shop')}
          />
        </KPIRow>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search unit, VIN, or plate"
        />

        <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState
            icon={Truck}
            title="No matching trucks"
            message="Try a different search or filter."
          />
        ) : (
          <EmptyState
            icon={Truck}
            title="No trucks yet"
            message={
              canCreate
                ? 'Tap + in the top right to add your first truck.'
                : 'Trucks you add will appear here.'
            }
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((t) => {
            const s = statusMeta(t.displayStatus);
            return (
              <EntityRow
                key={t.id}
                leading={<UnitChip number={t.unitNumber} />}
                title={truckTitle(t)}
                subline={truckSubline(t)}
                meta={t.meta || undefined}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/fleet/trucks/${t.id}`)}
                ariaLabel={`${truckTitle(t)}, ${s.label}`}
              />
            );
          })}
        </div>
      )}

      <NewTruckSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        suggestedUnitNumber={suggestedUnit}
      />
    </MobileScreen>
  );
}
