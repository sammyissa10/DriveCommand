'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronUp, RotateCw, Truck } from 'lucide-react';
import {
  SheetContainer,
  EntityRow,
  StatusPill,
  EmptyState,
  Skeleton,
  FieldGroup,
  PrimaryButton,
  type StatusTone,
  type FieldDef,
} from '@/components/ui/ds';
import type { VehicleLocation } from '@/lib/maps/map-utils';
import { deriveStatusCounts, type VehicleStatusKey } from '@/lib/tracking/deriveStatusCounts';
import { logger } from '@/lib/logger';

// Leaflet can't render on the server. A dark ds surface stands in while it loads
// — content-shaped, never a spinner (§1).
const LiveMapDynamic = dynamic(() => import('@/components/maps/live-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const POLL_INTERVAL_MS = 15_000;

/**
 * Tones deliberately track STATUS_COLORS (the map markers): moving=green,
 * idle=amber, offline=red, no-location=grey. The chip you tap and the dot you
 * see must be the same colour — an offline truck reading grey in the list but
 * red on the map is worse than either choice on its own.
 */
const STATUS_META: Record<Exclude<VehicleStatusKey, 'all'>, { tone: StatusTone; label: string }> = {
  moving: { tone: 'success', label: 'Moving' },
  idle: { tone: 'warning', label: 'Idle' },
  offline: { tone: 'danger', label: 'Offline' },
  'no-location': { tone: 'neutral', label: 'No GPS' },
};

const CHIP_ON: Record<StatusTone, string> = {
  success: 'bg-ds-success text-white',
  warning: 'bg-ds-warning text-white',
  danger: 'bg-ds-danger text-white',
  accent: 'bg-ds-accent text-white',
  neutral: 'bg-ds-elevated text-ds-txt',
  vip: 'bg-ds-vip text-white',
};

const FILTERS: { key: VehicleStatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'moving', label: 'Moving' },
  { key: 'idle', label: 'Idle' },
  { key: 'offline', label: 'Offline' },
  { key: 'no-location', label: 'No GPS' },
];

function truckLabel(v: VehicleLocation): string {
  return v.truck.licensePlate || [v.truck.make, v.truck.model].filter(Boolean).join(' ') || 'Truck';
}
function fmtSpeed(speed: number | null): string | null {
  if (speed == null) return null;
  return `${Math.round(speed)} mph`;
}
function fmtAgo(ts: Date | string | null): string | null {
  if (!ts) return null;
  const t = typeof ts === 'string' ? new Date(ts) : ts;
  if (isNaN(t.getTime())) return null;
  const mins = Math.floor((Date.now() - t.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Live Map — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function LiveMapMobile({
  initialVehicles,
  initialLoadFailed = false,
}: {
  initialVehicles: VehicleLocation[];
  /**
   * True when the page's server-side load THREW, as opposed to returning no
   * trucks. The page used to swallow that into an empty array and this
   * component had to guess the difference from `initialVehicles.length`.
   */
  initialLoadFailed?: boolean;
}) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleLocation[]>(initialVehicles);
  const [filter, setFilter] = useState<VehicleStatusKey>('all');
  const [listOpen, setListOpen] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Whether we actually know the fleet yet.
   *
   * This used to be seeded from `initialVehicles.length > 0`, because the page
   * swallowed server errors into an empty array and an empty `initialVehicles`
   * therefore meant "unknown", not "none". The page now reports the failure
   * (`initialLoadFailed`), so the seed can say what it means: a load that
   * SUCCEEDED has told us the fleet even when the answer was zero trucks.
   *
   * That also closes the hole in the old heuristic. A tenant who genuinely owns
   * no trucks produced an empty array from a perfectly good query, so
   * `hasLoaded` stayed false and the empty state — the one screen that would
   * have told them to go and add a truck — never rendered at all.
   */
  const [hasLoaded, setHasLoaded] = useState(!initialLoadFailed);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const counts = useMemo(() => deriveStatusCounts(vehicles), [vehicles]);

  const filtered = useMemo(
    () => (filter === 'all' ? vehicles : vehicles.filter((v) => v.status === filter)),
    [vehicles, filter],
  );
  const mapVehicles = useMemo(
    () => filtered.filter((v) => v.status !== 'no-location' && v.latitude !== null && v.longitude !== null),
    [filtered],
  );

  // Ignores the filter on purpose: this asks "is there anything plottable at all?",
  // which is a data problem, not a filter result.
  const plottableCount = useMemo(
    () => vehicles.filter((v) => v.status !== 'no-location' && v.latitude !== null && v.longitude !== null).length,
    [vehicles],
  );

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/carrier/live-map/vehicles');
      if (!res.ok) return;
      const json = await res.json();
      if (!mountedRef.current) return;
      setVehicles((json.data ?? []) as VehicleLocation[]);
      setHasLoaded(true);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err) {
      logger.error('Live map vehicles poll error:', err);
    }
  }, []);

  // Poll, but never while the tab is hidden.
  useEffect(() => {
    void fetchVehicles();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchVehicles();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchVehicles]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') void fetchVehicles();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchVehicles]);

  useEffect(() => {
    if (!lastUpdated) return;
    const timer = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  async function manualRefresh() {
    setRefreshing(true);
    await fetchVehicles();
    if (mountedRef.current) setRefreshing(false);
  }

  function focusVehicle(v: VehicleLocation) {
    // A truck that never reported has nowhere to fly to — say so rather than
    // swallowing the tap.
    if (v.latitude === null || v.longitude === null) {
      toast.message(`${truckLabel(v)} has no GPS position yet`, {
        description: 'It will appear on the map once it reports.',
      });
      return;
    }
    setFlyToTarget({ lat: v.latitude, lng: v.longitude });
    setListOpen(false);
    setSelectedTruckId(v.truckId);
    navigator.vibrate?.(10);
  }

  const countLabel = `${filtered.length} truck${filtered.length === 1 ? '' : 's'}`;
  const selected = selectedTruckId ? vehicles.find((v) => v.truckId === selectedTruckId) ?? null : null;

  /**
   * Say what is actually true. "0 moving · 0 idle" is noise on a fleet whose
   * trucks are all offline or haven't reported — and "13 trucks" over a map with
   * one dot needs explaining.
   */
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (counts.moving) parts.push(`${counts.moving} moving`);
    if (counts.idle) parts.push(`${counts.idle} idle`);
    if (counts.offline) parts.push(`${counts.offline} offline`);
    if (counts['no-location']) parts.push(`${counts['no-location']} no GPS`);
    return parts.slice(0, 3).join(' · ') || 'None reporting yet';
  }, [counts]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ds-bg">
      {/* Map */}
      <div className="absolute inset-0">
        <LiveMapDynamic
          initialVehicles={mapVehicles}
          flyToTarget={flyToTarget}
          dark
          showZoomControl={false}
          // The built-in details sheet is shadcn — it would pop a white panel out
          // of the dark map. We render our own ds sheet instead.
          hideDetailsSheet
          onVehicleClick={(truckId) => setSelectedTruckId(truckId)}
        />
      </div>

      {/*
        Nothing plottable — otherwise this is an empty dark map with no explanation
        of why a fleet you own isn't on it. One line, one way forward (§1).
      */}
      {hasLoaded && plottableCount === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center px-8">
          <div className="pointer-events-auto w-full max-w-sm rounded-[20px] bg-ds-card p-5 text-center shadow-2xl">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ds-accent/[0.16]">
              <Truck className="h-6 w-6 text-ds-accent" />
            </span>
            <p className="mt-3 text-[17px] font-semibold text-ds-txt">
              {vehicles.length === 0 ? 'No trucks yet' : 'No trucks reporting GPS'}
            </p>
            <p className="mt-1 text-[13px] text-ds-txt2">
              {vehicles.length === 0
                ? 'Trucks you add to the fleet will show here once they report a position.'
                : `${vehicles.length} truck${vehicles.length === 1 ? '' : 's'} ${
                    vehicles.length === 1 ? "hasn't" : "haven't"
                  } sent a position yet. Connect an ELD, or check the driver app is running.`}
            </p>
            <div className="mt-4">
              <PrimaryButton
                label={vehicles.length === 0 ? 'View trucks' : 'Set up tracking'}
                onClick={() => router.push(vehicles.length === 0 ? '/carrier/fleet/trucks' : '/settings/integrations')}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Status filters — float over the map */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] pt-3">
        <div className="pointer-events-auto flex gap-2 overflow-x-auto px-5 pb-1">
          {FILTERS.map(({ key, label }) => {
            const on = filter === key;
            const n = counts[key] ?? 0;
            if (key !== 'all' && n === 0) return null;
            const tone = key === 'all' ? 'accent' : STATUS_META[key as Exclude<VehicleStatusKey, 'all'>].tone;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(key)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold shadow-lg transition active:opacity-75 ${
                  on ? CHIP_ON[tone] : 'bg-ds-card text-ds-txt2'
                }`}
              >
                <span>{label}</span>
                <span className={on ? 'opacity-80' : 'text-ds-txt3'}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Freshness + manual refresh */}
      <div className="absolute right-5 top-16 z-[500]">
        <button
          type="button"
          onClick={manualRefresh}
          disabled={refreshing}
          aria-label="Refresh vehicle positions"
          className="flex h-9 items-center gap-1.5 rounded-full bg-ds-card px-3 text-[12px] text-ds-txt3 shadow-lg transition active:opacity-75 disabled:opacity-50"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>{lastUpdated ? `${secondsAgo}s ago` : 'Updating…'}</span>
        </button>
      </div>

      {/* Bottom bar — opens the vehicle list (a sheet, never a FAB) */}
      <button
        type="button"
        onClick={() => setListOpen(true)}
        className="absolute inset-x-0 bottom-0 z-[500] flex items-center gap-3 rounded-t-[24px] bg-ds-card px-5 pb-5 pt-4 text-left shadow-2xl transition active:opacity-75"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ds-accent/[0.16]">
          <Truck className="h-5 w-5 text-ds-accent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ds-txt">{countLabel}</span>
          <span className="block truncate text-[13px] text-ds-txt3">{summary}</span>
        </span>
        <ChevronUp className="h-5 w-5 shrink-0 text-ds-txt3" />
      </button>

      {/* Vehicle list */}
      <SheetContainer
        open={listOpen}
        onCancel={() => setListOpen(false)}
        title="Trucks"
        subtitle={filter === 'all' ? countLabel : `${countLabel} · ${STATUS_META[filter as Exclude<VehicleStatusKey, 'all'>]?.label ?? ''}`}
        cancelLabel="Close"
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No trucks here"
            message={filter === 'all' ? 'Trucks reporting GPS will appear here.' : 'Try a different filter.'}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((v) => {
              const meta = STATUS_META[v.status as Exclude<VehicleStatusKey, 'all'>] ?? {
                tone: 'neutral' as StatusTone,
                label: String(v.status),
              };
              const located = v.latitude !== null && v.longitude !== null;
              const rowMeta = [fmtSpeed(v.speed), fmtAgo(v.timestamp)].filter(Boolean).join(' · ');
              return (
                <EntityRow
                  key={v.id}
                  leading={
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
                      <Truck className="h-5 w-5 text-ds-txt2" />
                    </div>
                  }
                  title={truckLabel(v)}
                  subline={v.driver?.name ?? 'Unassigned'}
                  meta={rowMeta || (located ? undefined : 'No GPS signal')}
                  metaTone={located ? 'muted' : 'warning'}
                  pill={<StatusPill label={meta.label} tone={meta.tone} />}
                  onClick={() => focusVehicle(v)}
                  ariaLabel={`${truckLabel(v)}, ${meta.label}`}
                />
              );
            })}
          </div>
        )}
      </SheetContainer>

      {/* Truck detail — ds replacement for the shadcn VehicleDetailsSheet */}
      <SheetContainer
        open={selected !== null}
        onCancel={() => setSelectedTruckId(null)}
        title={selected ? truckLabel(selected) : 'Truck'}
        subtitle={selected?.driver?.name ?? 'Unassigned'}
        cancelLabel="Close"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <StatusPill
                label={STATUS_META[selected.status as Exclude<VehicleStatusKey, 'all'>]?.label ?? String(selected.status)}
                tone={STATUS_META[selected.status as Exclude<VehicleStatusKey, 'all'>]?.tone ?? 'neutral'}
              />
            </div>

            <FieldGroup
              isEditing={false}
              fields={
                [
                  { key: 'driver', label: 'Driver', value: selected.driver?.name ?? null },
                  { key: 'speed', label: 'Speed', value: fmtSpeed(selected.speed) },
                  { key: 'lastPing', label: 'Last report', value: fmtAgo(selected.timestamp) },
                  {
                    key: 'vehicle',
                    label: 'Vehicle',
                    value: [selected.truck.year, selected.truck.make, selected.truck.model].filter(Boolean).join(' ') || null,
                  },
                  { key: 'plate', label: 'Plate', value: selected.truck.licensePlate || null },
                ] as FieldDef[]
              }
            />

            <PrimaryButton
              label="View truck"
              onClick={() => {
                setSelectedTruckId(null);
                router.push(`/carrier/fleet/trucks/${selected.truckId}`);
              }}
            />
          </div>
        ) : null}
      </SheetContainer>
    </div>
  );
}
