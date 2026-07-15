'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  MonogramAvatar,
  StatusPill,
  EmptyState,
  type StatusTone,
  type MetaTone,
  type SegmentOption,
} from '@/components/ui/ds';
import type { DriverDuty } from '@/lib/carrier/driver-status';
import { InviteDriverSheet } from './InviteDriverSheet';

/** A driver row with its duty status, subline, and meta precomputed server-side. */
export interface DriverMobileRow {
  id: string;
  name: string;
  email: string | null;
  /** Driving / On Duty / Off Duty — HOS-first, dispatch/roster fallback. */
  duty: DriverDuty;
  /** Pending invitation (not yet accepted) — shown as a neutral "Invited" pill. */
  invited: boolean;
  /** Live context — active dispatch, else identity (CDL class · terminal). */
  subline: string;
  /** HOS clock ("6h today · 4h left"), else CDL/pay fallback. */
  meta: string;
  metaTone: MetaTone;
  /** CDL expired/expiring — renders the amber dot on the avatar. */
  complianceWarn: boolean;
}

// Duty status → token tint + label. Invited (unaccepted) drivers keep a distinct pill.
function pillMeta(d: DriverMobileRow): { tone: StatusTone; label: string } {
  if (d.invited) return { tone: 'neutral', label: 'Invited' };
  switch (d.duty) {
    case 'driving':
      return { tone: 'accent', label: 'Driving' };
    case 'on_duty':
      return { tone: 'success', label: 'On Duty' };
    default:
      return { tone: 'neutral', label: 'Off Duty' };
  }
}

type DriverFilter = 'all' | 'driving' | 'on_duty' | 'off_duty' | 'active';

const FILTER_OPTIONS: SegmentOption<DriverFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Off Duty', value: 'off_duty' },
];

/**
 * Drivers Overview — mobile-web design system view (carrier fleet).
 * Rendered only at mobile widths; the desktop grid stays on `lg+`.
 *
 * The carrier portal has no HOS data, so this dispatch view answers "who can
 * take this load" with what the schema has: availability vs on-trip, CDL
 * compliance (the money-costing state → warning tint + avatar dot), and account
 * status (invited-but-unaccepted). All derivation is server-side.
 */
export function DriversMobile({
  drivers,
  canCreate,
}: {
  drivers: DriverMobileRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DriverFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);

  // KPI counts are full-list aggregates (every driver lands in exactly one bucket).
  const counts = useMemo(() => {
    let driving = 0;
    let onDuty = 0;
    let offDuty = 0;
    for (const d of drivers) {
      if (d.duty === 'driving') driving += 1;
      else if (d.duty === 'on_duty') onDuty += 1;
      else offDuty += 1;
    }
    return { driving, onDuty, offDuty };
  }, [drivers]);

  const visible = useMemo(() => {
    let list = drivers;
    if (filter === 'active') list = list.filter((d) => d.duty === 'driving' || d.duty === 'on_duty');
    else if (filter !== 'all') list = list.filter((d) => d.duty === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) || (d.email?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [drivers, filter, query]);

  const isFiltering = query.trim().length > 0 || filter !== 'all';
  const countLabel = `${drivers.length} driver${drivers.length === 1 ? '' : 's'}`;

  function setFilterToggle(next: DriverFilter) {
    setFilter((f) => (f === next ? 'all' : next));
  }

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Drivers"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={canCreate ? () => setInviteOpen(true) : undefined}
        addLabel="Invite driver"
      />

      <div className="space-y-3">
        <KPIRow>
          <KPICard
            value={counts.driving}
            label="Driving"
            tone="accent"
            active={filter === 'driving'}
            onClick={() => setFilterToggle('driving')}
          />
          <KPICard
            value={counts.onDuty}
            label="On Duty"
            tone="success"
            active={filter === 'on_duty'}
            onClick={() => setFilterToggle('on_duty')}
          />
          <KPICard
            value={counts.offDuty}
            label="Off Duty"
            tone="neutral"
            active={filter === 'off_duty'}
            onClick={() => setFilterToggle('off_duty')}
          />
        </KPIRow>

        <SearchField value={query} onChange={setQuery} placeholder="Search name or email" />

        <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState
            icon={Users}
            title="No matching drivers"
            message="Try a different search or filter."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No drivers yet"
            message={
              canCreate
                ? 'Tap + in the top right to invite your first driver.'
                : 'Drivers added to your fleet will appear here.'
            }
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((d) => {
            const s = pillMeta(d);
            return (
              <EntityRow
                key={d.id}
                leading={<MonogramAvatar name={d.name} warning={d.complianceWarn} />}
                title={d.name}
                subline={d.subline}
                meta={d.meta || undefined}
                metaTone={d.metaTone}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/fleet/drivers/${d.id}`)}
                ariaLabel={`${d.name}, ${s.label}`}
              />
            );
          })}
        </div>
      )}

      <InviteDriverSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </MobileScreen>
  );
}
