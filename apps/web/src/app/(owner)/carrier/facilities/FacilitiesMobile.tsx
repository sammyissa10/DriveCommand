'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Warehouse, Container, Store, type LucideIcon } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  EntityRow,
  StatusPill,
  EmptyState,
  type StatusTone,
} from '@/components/ui/ds';

/** A facility row with its type label/tone and display strings precomputed server-side. */
export interface FacilityMobileRow {
  id: string;
  name: string;
  /** Raw facilityType (terminal / warehouse / yard / drop_yard / customer_site / …). */
  type: string;
  typeLabel: string;
  tone: StatusTone;
  /** "City, ST" (or a coarser location), else null. */
  location: string | null;
  /** Contact name and/or dock requirements — the operational hint, else null. */
  meta: string | null;
}

/** Square tile — a facility is a place, not a person. Icon keyed to its type. */
const TYPE_ICON: Record<string, LucideIcon> = {
  terminal: Building2,
  warehouse: Warehouse,
  yard: Container,
  drop_yard: Container,
  customer_site: Store,
};

function FacilityTile({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? Building2;
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
      <Icon className="h-5 w-5 text-ds-txt2" strokeWidth={1.5} />
    </div>
  );
}

/**
 * Facilities Overview — mobile-web design system view (carrier network).
 * Rendered only at mobile widths; the desktop grid stays on `lg+`.
 *
 * Facilities are single-dimension (type), so the three headline physical types
 * (Terminal / Warehouse / Yard) are the tap-to-filter KPIs; every type still
 * carries its own pill on the row, so Drop Yard / Customer Site stay labeled and
 * reachable by search. All derivation is server-side.
 */
export function FacilitiesMobile({
  facilities,
  canCreate,
}: {
  facilities: FacilityMobileRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // KPI counts are full-list aggregates.
  const counts = useMemo(() => {
    let terminal = 0;
    let warehouse = 0;
    let yard = 0;
    for (const f of facilities) {
      if (f.type === 'terminal') terminal += 1;
      else if (f.type === 'warehouse') warehouse += 1;
      else if (f.type === 'yard') yard += 1;
    }
    return { terminal, warehouse, yard };
  }, [facilities]);

  const visible = useMemo(() => {
    let list = facilities;
    if (typeFilter) list = list.filter((f) => f.type === typeFilter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.location?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [facilities, typeFilter, query]);

  const hasAny = facilities.length > 0;
  const isFiltering = query.trim().length > 0 || typeFilter !== null;
  const countLabel = `${facilities.length} facilit${facilities.length === 1 ? 'y' : 'ies'}`;

  function toggleType(next: string) {
    setTypeFilter((t) => (t === next ? null : next));
  }

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Facilities"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={canCreate ? () => router.push('/carrier/facilities/new') : undefined}
        addLabel="New facility"
      />

      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard
              value={counts.terminal}
              label="Terminals"
              tone="accent"
              active={typeFilter === 'terminal'}
              onClick={() => toggleType('terminal')}
            />
            <KPICard
              value={counts.warehouse}
              label="Warehouses"
              tone="success"
              active={typeFilter === 'warehouse'}
              onClick={() => toggleType('warehouse')}
            />
            <KPICard
              value={counts.yard}
              label="Yards"
              tone="warning"
              active={typeFilter === 'yard'}
              onClick={() => toggleType('yard')}
            />
          </KPIRow>

          <SearchField value={query} onChange={setQuery} placeholder="Search name or city" />
        </div>
      ) : null}

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState
            icon={Warehouse}
            title="No matching facilities"
            message="Try a different search or filter."
          />
        ) : (
          <EmptyState
            icon={Warehouse}
            title="No facilities yet"
            message={
              canCreate
                ? 'Tap + in the top right to add your first facility.'
                : 'Facilities added to your network will appear here.'
            }
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((f) => (
            <EntityRow
              key={f.id}
              leading={<FacilityTile type={f.type} />}
              title={f.name}
              subline={f.location ?? undefined}
              meta={f.meta ?? undefined}
              pill={<StatusPill label={f.typeLabel} tone={f.tone} />}
              onClick={() => router.push(`/carrier/facilities/${f.id}`)}
              ariaLabel={`${f.name}, ${f.typeLabel}`}
            />
          ))}
        </div>
      )}
    </MobileScreen>
  );
}
