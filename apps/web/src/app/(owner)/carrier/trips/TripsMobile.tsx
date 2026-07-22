'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Route } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  StatusPill,
  EmptyState,
  PrimaryButton,
  Skeleton,
  type StatusTone,
} from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Data — same endpoint + shape the desktop DispatchesGrid uses
// ---------------------------------------------------------------------------

interface ApiDispatch {
  id: string;
  driverId: string | null;
  truckId: string | null;
  scheduledDate: string;
  status: string;
  notes: string | null;
  _count?: { loads: number };
}

interface TripRow {
  id: string;
  number: string;
  driver: string | null;
  truck: string | null;
  scheduledDate: string;
  status: string;
  loadCount: number;
}

function dispatchNumberFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return m ? m[1] : null;
}

const STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  planned: { tone: 'neutral', label: 'Planned' },
  in_progress: { tone: 'accent', label: 'In progress' },
  completed: { tone: 'success', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  tonu: { tone: 'warning', label: 'TONU' },
};
function statusMeta(s: string) {
  return STATUS_META[s] ?? { tone: 'neutral' as StatusTone, label: s.replace(/_/g, ' ') };
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
/** "Today" / "Tomorrow" / "Mon, Jul 14". */
function fmtDay(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (dateKey(d) === dateKey(now)) return 'Today';
  if (dateKey(d) === dateKey(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type Scope = 'all' | 'today' | 'upcoming';
const SCOPE_OPTIONS: { label: string; value: Scope }[] = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
];

/** Square icon tile — a trip is a "thing", so it gets a rounded square (not a circle). */
function TripTile() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
      <Route className="h-5 w-5 text-ds-txt2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trips overview — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function TripsMobile({
  driverMap,
  truckMap,
  canCreate,
  hasLoads,
}: {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  canCreate: boolean;
  /** Whether the tenant has any real load to assign — drives the empty state. */
  hasLoads: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TripRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');

  useEffect(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    fetch(`/api/v1/carrier/dispatches?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const items = (json?.data?.items ?? json?.data ?? []) as ApiDispatch[];
        setRows(
          items.map((it) => ({
            id: it.id,
            number: dispatchNumberFromNotes(it.notes) ?? `Trip ${it.id.slice(0, 8).toUpperCase()}`,
            driver: it.driverId ? driverMap[it.driverId] ?? null : null,
            truck: it.truckId ? truckMap[it.truckId] ?? null : null,
            scheduledDate: it.scheduledDate,
            status: it.status,
            loadCount: it._count?.loads ?? 0,
          })),
        );
      })
      .catch(() => setRows([]));
  }, [driverMap, truckMap]);

  const counts = useMemo(() => {
    let planned = 0;
    let active = 0;
    let completed = 0;
    for (const r of rows ?? []) {
      if (r.status === 'planned') planned += 1;
      else if (r.status === 'in_progress') active += 1;
      else if (r.status === 'completed') completed += 1;
    }
    return { planned, active, completed };
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows ?? [];
    if (status) list = list.filter((r) => r.status === status);
    if (scope !== 'all') {
      const now = new Date();
      const todayK = dateKey(now);
      list = list.filter((r) => {
        const d = new Date(r.scheduledDate);
        if (isNaN(d.getTime())) return false;
        if (scope === 'today') return dateKey(d) === todayK;
        // upcoming — scheduled after today
        const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const tOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return dOnly > tOnly;
      });
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.number.toLowerCase().includes(q) ||
          (r.driver?.toLowerCase().includes(q) ?? false) ||
          (r.truck?.toLowerCase().includes(q) ?? false),
      );
    }
    // Soonest-relevant first: newest scheduled date at the top.
    return [...list].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }, [rows, status, scope, query]);

  const isFiltering = query.trim().length > 0 || status !== null || scope !== 'all';
  const countLabel = rows === null ? ' ' : `${rows.length} trip${rows.length === 1 ? '' : 's'}`;
  const hasAny = (rows?.length ?? 0) > 0;

  function toggleStatus(next: string) {
    setStatus((s) => (s === next ? null : next));
  }

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Trips"
        subtitle={countLabel}
        onAdd={canCreate ? () => router.push('/carrier/trips/new') : undefined}
        addLabel="New trip"
      />

      {/* Glance + filters earn their place only once there's something to filter. */}
      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard value={counts.planned} label="Planned" tone="neutral" active={status === 'planned'} onClick={() => toggleStatus('planned')} />
            <KPICard value={counts.active} label="In progress" tone="accent" active={status === 'in_progress'} onClick={() => toggleStatus('in_progress')} />
            <KPICard value={counts.completed} label="Completed" tone="success" active={status === 'completed'} onClick={() => toggleStatus('completed')} />
          </KPIRow>

          <SearchField value={query} onChange={setQuery} placeholder="Search trip #, driver, or unit" />

          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      ) : null}

      {rows === null ? (
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="min-h-[92px] rounded-[20px] bg-ds-card p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        isFiltering ? (
          <EmptyState icon={Route} title="No matching trips" message="Try a different search or filter." />
        ) : !canCreate ? (
          <EmptyState
            icon={Route}
            title="No trips yet"
            message="Trips assigned to your fleet will appear here."
          />
        ) : !hasLoads ? (
          // Guided empty state — a trip needs a load first.
          <div>
            <EmptyState
              icon={Route}
              title="Create a load first"
              message="Before you can plan a trip, create a load and assign it here."
            />
            <div className="mx-4">
              <PrimaryButton label="New load" onClick={() => router.push('/carrier/loads/new')} />
            </div>
          </div>
        ) : (
          // Loads exist — nudge the user to put one on a trip.
          <div>
            <EmptyState
              icon={Route}
              title="Assign a load to start a trip"
              message="Pick a load, add a truck and driver, then dispatch."
            />
            <div className="mx-4">
              <PrimaryButton label="Assign a load" onClick={() => router.push('/carrier/trips/new')} />
            </div>
          </div>
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((r) => {
            const s = statusMeta(r.status);
            const subline = [r.driver ?? 'Unassigned', r.truck ? `Unit ${r.truck}` : null].filter(Boolean).join(' · ');
            const day = fmtDay(r.scheduledDate);
            const meta = [day, r.loadCount > 0 ? `${r.loadCount} load${r.loadCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
            return (
              <EntityRow
                key={r.id}
                leading={<TripTile />}
                title={r.number}
                subline={subline}
                meta={meta || undefined}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/trips/${r.id}`)}
                ariaLabel={`${r.number}, ${s.label}`}
              />
            );
          })}
        </div>
      )}
    </MobileScreen>
  );
}
