'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Truck, ClipboardList } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchItem {
  id: string;
  status: string;
  notes: string | null;
  primaryDriverId: string;
  truckId: string;
  scheduledDeparture: string;
  _count: { stops: number };
  completedStopsCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  tonu: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
};

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  tonu: 'TONU',
};

function getTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function extractDispatchNumber(notes: string | null): string {
  if (!notes) return '—';
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : '—';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TodayDispatches({
  driverMap,
  truckMap,
}: {
  driverMap?: Record<string, string>;
  truckMap?: Record<string, string>;
}) {
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = getTodayISO();
    const params = new URLSearchParams({
      date_from: today,
      date_to: today + 'T23:59:59',
      pageSize: '50',
    });
    fetch(`/api/v1/carrier/dispatches?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setDispatches(json.data?.items ?? []))
      .catch(() => setDispatches([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
            <div className="flex justify-between mb-3">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded-full" />
            </div>
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-28 bg-muted rounded-full" />
              <div className="h-5 w-20 bg-muted rounded-full" />
            </div>
            <div className="h-2 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (dispatches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No dispatches scheduled for today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dispatches.map((d) => {
        const dispatchNumber = extractDispatchNumber(d.notes);
        const statusClass = STATUS_BADGE[d.status] ?? STATUS_BADGE.planned;
        const statusLabel = STATUS_LABEL[d.status] ?? d.status;
        const totalStops = d._count.stops;
        const completedStops = d.completedStopsCount;
        const progressPct = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;
        const driverName = driverMap?.[d.primaryDriverId] ?? 'Unassigned';
        const truckUnit = truckMap?.[d.truckId] ?? '—';

        return (
          <Link
            key={d.id}
            href={`/carrier/dispatches/${d.id}`}
            className="block rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="font-semibold text-sm text-foreground">{dispatchNumber}</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {driverName}
              </span>
              <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs text-muted-foreground">
                <Truck className="h-3 w-3" />
                {truckUnit}
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {completedStops}/{totalStops} stops
                </span>
              </div>
              <div className="bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
