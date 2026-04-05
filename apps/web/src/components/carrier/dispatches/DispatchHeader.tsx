'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Truck, ChevronDown, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers (copied from DispatchCard — NOT imported to keep files independent)
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchHeaderProps {
  dispatch: {
    id: string;
    status: string;
    notes: string | null;
    primaryDriverId: string;
    coDriverId: string | null;
    truckId: string;
    plannedMiles: number | null;
    actualMiles: number | null;
  };
  driverName: string;
  coDriverName: string;
  truckUnit: string;
  allStopsDone: boolean;
}

// ---------------------------------------------------------------------------
// StatusActionsMenu — simple popover-style dropdown for Cancel/TONU
// ---------------------------------------------------------------------------

function StatusActionsMenu({
  isPending,
  onCancel,
  onTonu,
}: {
  isPending: boolean;
  onCancel: () => void;
  onTonu: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        aria-label="More status actions"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1">
          <button
            className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-accent transition-colors"
            onClick={() => { setOpen(false); onCancel(); }}
          >
            Cancel Dispatch
          </button>
          <button
            className="w-full px-4 py-2 text-sm text-left text-amber-600 hover:bg-accent transition-colors"
            onClick={() => { setOpen(false); onTonu(); }}
          >
            Mark TONU
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchHeader({
  dispatch,
  driverName,
  coDriverName,
  truckUnit,
  allStopsDone,
}: DispatchHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const dispatchNumber = extractDispatchNumber(dispatch.notes);
  const statusClass = STATUS_BADGE[dispatch.status] ?? STATUS_BADGE.planned;
  const statusLabel = STATUS_LABEL[dispatch.status] ?? dispatch.status;

  const [plannedMilesInput, setPlannedMilesInput] = useState<string>(
    dispatch.plannedMiles != null ? String(dispatch.plannedMiles) : ''
  );
  const [actualMilesInput, setActualMilesInput] = useState<string>(
    dispatch.actualMiles != null ? String(dispatch.actualMiles) : ''
  );

  const isLocked = dispatch.status === 'completed' || dispatch.status === 'cancelled' || dispatch.status === 'tonu';
  const isInProgress = dispatch.status === 'in_progress';

  async function patchDispatch(data: Record<string, unknown>) {
    const res = await fetch(`/api/v1/carrier/dispatches/${dispatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to update dispatch');
    }
  }

  async function patchStatus(status: string) {
    const res = await fetch(`/api/v1/carrier/dispatches/${dispatch.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to update status');
    }
  }

  function handleStartTrip() {
    startTransition(async () => {
      try {
        await patchStatus('in_progress');
        toast.success('Trip started');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to start trip');
      }
    });
  }

  function handleCompleteDispatch() {
    startTransition(async () => {
      try {
        await patchStatus('completed');
        toast.success('Dispatch completed');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to complete dispatch');
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      try {
        await patchStatus('cancelled');
        toast.success('Dispatch cancelled');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to cancel dispatch');
      }
    });
  }

  function handleTonu() {
    startTransition(async () => {
      try {
        await patchStatus('tonu');
        toast.success('Dispatch marked as TONU');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to mark TONU');
      }
    });
  }

  function handlePlannedMilesBlur() {
    const val = parseFloat(plannedMilesInput);
    if (!isNaN(val) && val !== dispatch.plannedMiles) {
      patchDispatch({ plannedMiles: val }).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save odometer start');
      });
    }
  }

  function handleActualMilesBlur() {
    const val = parseFloat(actualMilesInput);
    if (!isNaN(val) && val !== dispatch.actualMiles) {
      patchDispatch({ actualMiles: val }).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save odometer end');
      });
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      {/* Top row: dispatch number + status badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-foreground">{dispatchNumber}</h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>

        {/* Edit link + status actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit button — disabled when in_progress or completed */}
          {isInProgress || isLocked ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border bg-background text-muted-foreground cursor-not-allowed opacity-50"
              title="Cannot edit an active or completed dispatch"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </span>
          ) : (
            <Link
              href={`/carrier/dispatches/${dispatch.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border bg-background hover:bg-accent transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </Link>
          )}

          {/* Status action button */}
          {dispatch.status === 'planned' && (
            <>
              <Button
                size="sm"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isPending}
                onClick={handleStartTrip}
              >
                {isPending ? 'Starting…' : 'Start Trip'}
              </Button>
              <StatusActionsMenu
                isPending={isPending}
                onCancel={handleCancel}
                onTonu={handleTonu}
              />
            </>
          )}

          {dispatch.status === 'in_progress' && (
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isPending || !allStopsDone}
              title={!allStopsDone ? 'All stops must be completed or skipped first' : undefined}
              onClick={handleCompleteDispatch}
            >
              {isPending ? 'Completing…' : 'Complete Dispatch'}
            </Button>
          )}
        </div>
      </div>

      {/* Driver / truck chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {driverName}
        </span>
        {dispatch.coDriverId && coDriverName && (
          <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {coDriverName}
            <span className="text-xs text-muted-foreground/70">(co-driver)</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm text-muted-foreground">
          <Truck className="h-3.5 w-3.5" />
          {truckUnit}
        </span>
      </div>

      {/* Odometer inputs */}
      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Odometer Start (mi)
          </label>
          <input
            type="number"
            value={plannedMilesInput}
            onChange={(e) => setPlannedMilesInput(e.target.value)}
            onBlur={handlePlannedMilesBlur}
            disabled={isLocked}
            placeholder="—"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Odometer End (mi)
          </label>
          <input
            type="number"
            value={actualMilesInput}
            onChange={(e) => setActualMilesInput(e.target.value)}
            onBlur={handleActualMilesBlur}
            disabled={isLocked}
            placeholder="—"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}
