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
import { cn } from '@/lib/utils';

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

/** Canonical type ordering for the filter chips (unknown types trail, A–Z). */
const TYPE_ORDER = ['terminal', 'warehouse', 'yard', 'drop_yard', 'customer_site'];

/**
 * Horizontally scrollable filter chips — All + every type present. Covers all
 * types (incl. Drop Yard / Customer Site) that the 3 KPI cards can't, and stays
 * in sync with them via the shared `typeFilter`.
 */
function FilterChips({
  options,
  value,
  onChange,
}: {
  options: { type: string; label: string }[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const chip = (active: boolean) =>
    cn(
      'h-8 shrink-0 rounded-full px-3.5 text-[13px] transition active:opacity-75',
      active ? 'bg-ds-accent/[0.16] font-semibold text-ds-accent' : 'bg-ds-card text-ds-txt2',
    );
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onClick={() => onChange(null)} className={chip(value === null)}>
        All
      </button>
      {options.map((o) => (
        <button
          key={o.type}
          type="button"
          onClick={() => onChange(value === o.type ? null : o.type)}
          className={chip(value === o.type)}
        >
          {o.label}
        </button>
      ))}
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

  // Filter-chip options: every distinct type present, in canonical order.
  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of facilities) {
      if (f.type && !seen.has(f.type)) seen.set(f.type, f.typeLabel);
    }
    return [...seen.entries()]
      .map(([type, label]) => ({ type, label }))
      .sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.type);
        const bi = TYPE_ORDER.indexOf(b.type);
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a.label.localeCompare(b.label);
      });
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

          {typeOptions.length > 1 ? (
            <FilterChips options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
          ) : null}
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
