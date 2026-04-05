'use client';

import Link from 'next/link';
import { Bell, User, Truck } from 'lucide-react';

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

interface DispatchCardProps {
  dispatch: DispatchItem;
  driverName: string;
  truckUnit: string;
  clientNames: string;
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

function extractDispatchNumber(notes: string | null): string {
  if (!notes) return '—';
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : '—';
}

function checkNeedsAssignment(notes: string | null): boolean {
  return notes?.includes('needs_assignment=true') ?? false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchCard({ dispatch, driverName, truckUnit, clientNames }: DispatchCardProps) {
  const dispatchNumber = extractDispatchNumber(dispatch.notes);
  const needsAssignment = checkNeedsAssignment(dispatch.notes);
  const statusClass = STATUS_BADGE[dispatch.status] ?? STATUS_BADGE.planned;
  const statusLabel = STATUS_LABEL[dispatch.status] ?? dispatch.status;

  const totalStops = dispatch._count.stops;
  const completedStops = dispatch.completedStopsCount;
  const progressPct = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;

  const departure = new Date(dispatch.scheduledDeparture);
  const departureStr =
    departure.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    departure.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <Link
      href={`/carrier/dispatches/${dispatch.id}`}
      className="block rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer"
    >
      {/* Top row: dispatch number + badges */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-semibold text-sm text-foreground">{dispatchNumber}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {needsAssignment && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
              <Bell className="h-3 w-3 mr-1" />
              Needs Assignment
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Middle row: driver + truck chips */}
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

      {/* Stops progress */}
      <div className="mb-3">
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

      {/* Bottom row: departure + client names */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{departureStr}</span>
        {clientNames && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px] text-right">
            {clientNames}
          </span>
        )}
      </div>
    </Link>
  );
}
