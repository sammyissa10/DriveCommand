'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Truck, ChevronDown, Edit2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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

/**
 * Format a recurrence rule (iCal RRULE) into a human-readable summary.
 * E.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR" → "Mon, Wed, Fri"
 * E.g. "FREQ=DAILY;INTERVAL=1" → "Daily"
 */
function formatRecurrenceRule(rule: string | null, tz: string | null, departureTime: string | null): string {
  if (!rule) return '';

  try {
    const parts: Record<string, string> = {};
    for (const seg of rule.split(';')) {
      const eq = seg.indexOf('=');
      if (eq === -1) continue;
      parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
    }

    const freq = parts['FREQ'];
    const byDay = parts['BYDAY'];
    const interval = parseInt(parts['INTERVAL'] ?? '1', 10);

    const DAY_LABELS: Record<string, string> = {
      MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
    };

    let schedule = '';
    if (freq === 'DAILY') {
      schedule = interval === 1 ? 'Daily' : `Every ${interval} days`;
    } else if (freq === 'WEEKLY') {
      if (byDay) {
        const days = byDay.split(',').map((d) => DAY_LABELS[d] ?? d).join(', ');
        schedule = interval === 1 ? days : `Every ${interval} weeks: ${days}`;
      } else {
        schedule = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
      }
    } else if (freq === 'MONTHLY') {
      schedule = interval === 1 ? 'Monthly' : `Every ${interval} months`;
    } else {
      schedule = rule;
    }

    if (departureTime) {
      const [h, m] = departureTime.split(':').map(Number);
      const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
      const hour12 = ((h ?? 0) % 12) || 12;
      const min = String(m ?? 0).padStart(2, '0');
      const tzAbbr = tz ? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz : '';
      schedule += ` at ${hour12}:${min} ${ampm}${tzAbbr ? ` ${tzAbbr}` : ''}`;
    }

    return schedule;
  } catch {
    return rule;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  templateName: string;
  recurrenceRule: string | null;
  scheduledDepartureTime: string | null;
  recurrenceTimezone: string;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
  stops: Array<{
    sequenceOrder: number;
    stopType: string;
    facility: { name: string; city: string | null; state: string | null };
  }>;
}

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
    scheduledDeparture: string;
    scheduledArrival: string | null;
    // Route template fields (optional — only present when dispatch has a template)
    routeTemplateId?: string | null;
    routeTemplateName?: string | null;
    routeTemplateRecurrenceRule?: string | null;
    routeTemplateRecurrenceTimezone?: string | null;
    routeTemplateScheduledDepartureTime?: string | null;
  };
  driverName: string;
  coDriverName: string;
  truckUnit: string;
  allStopsDone: boolean;
  allDrivers?: Array<{ id: string; name: string }>;
  allTrucks?: Array<{ id: string; unitNumber: string }>;
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
  allDrivers = [],
  allTrucks = [],
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

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    scheduledDeparture: '',
    plannedMiles: '',
    actualMiles: '',
    notes: '',
    primaryDriverId: '',
    coDriverId: '',
    truckId: '',
    routeTemplateId: '',
  });

  // Templates for edit dialog
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

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

  function openEditDialog() {
    // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
    const depLocal = dispatch.scheduledDeparture
      ? dispatch.scheduledDeparture.slice(0, 16)
      : '';

    // Strip [DISPATCH_NUMBER=...] prefix, [AUTO-GENERATED] suffix, and [Template: ...] tag from notes
    const cleanedNotes = dispatch.notes
      ?.replace(/^\[DISPATCH_NUMBER=[^\]]*\]\s*/, '')
      .replace(/\s*\[AUTO-GENERATED\]\s*$/, '')
      .replace(/\s*\[Template:[^\]]*\]\s*/g, '')
      .trim() ?? '';

    setEditForm({
      scheduledDeparture: depLocal,
      plannedMiles: String(dispatch.plannedMiles ?? ''),
      actualMiles: String(dispatch.actualMiles ?? ''),
      notes: cleanedNotes,
      primaryDriverId: dispatch.primaryDriverId,
      coDriverId: dispatch.coDriverId ?? '',
      truckId: dispatch.truckId,
      routeTemplateId: dispatch.routeTemplateId ?? '',
    });

    // Load templates lazily when edit dialog first opens
    if (!templatesLoaded && dispatch.status === 'planned') {
      fetch('/api/v1/carrier/route-templates/active')
        .then((r) => r.json())
        .then((body) => {
          if (body.data) setTemplates(body.data as Template[]);
          setTemplatesLoaded(true);
        })
        .catch(() => setTemplatesLoaded(true));
    }

    setEditOpen(true);
  }

  function handleEditSave() {
    startTransition(async () => {
      try {
        // Validate co-driver is not same as primary driver
        if (
          dispatch.status === 'planned' &&
          editForm.coDriverId &&
          editForm.coDriverId === editForm.primaryDriverId
        ) {
          toast.error('Co-driver cannot be the same as primary driver');
          return;
        }

        // Extract the [DISPATCH_NUMBER=...] tag to re-prepend on save
        const dnMatch = dispatch.notes?.match(/^\[DISPATCH_NUMBER=[^\]]*\]/) ?? null;
        const dnTag = dnMatch?.[0] ?? null;

        // Check if [AUTO-GENERATED] suffix was present
        const hadAutoGenerated = dispatch.notes?.includes('[AUTO-GENERATED]') ?? false;

        // Reconstruct notes with tags preserved
        let savedNotes = editForm.notes.trim();
        if (dnTag) {
          savedNotes = savedNotes ? `${dnTag} ${savedNotes}` : dnTag;
        }
        if (hadAutoGenerated) {
          savedNotes = `${savedNotes} [AUTO-GENERATED]`;
        }

        const payload: Record<string, unknown> = {
          scheduledDeparture: editForm.scheduledDeparture
            ? new Date(editForm.scheduledDeparture).toISOString()
            : undefined,
          notes: savedNotes || undefined,
        };

        if (editForm.plannedMiles !== '') {
          const val = parseFloat(editForm.plannedMiles);
          if (!isNaN(val)) payload.plannedMiles = val;
        }
        if (editForm.actualMiles !== '') {
          const val = parseFloat(editForm.actualMiles);
          if (!isNaN(val)) payload.actualMiles = val;
        }

        // Include assignment fields only when status is planned
        if (dispatch.status === 'planned') {
          payload.primaryDriverId = editForm.primaryDriverId;
          payload.truckId = editForm.truckId;
          payload.coDriverId = editForm.coDriverId || null;
          // Include template if changed
          if (editForm.routeTemplateId !== (dispatch.routeTemplateId ?? '')) {
            payload.routeTemplateId = editForm.routeTemplateId || undefined;
          }
        }

        await patchDispatch(payload);

        // Keep inline odometer inputs in sync
        if (payload.plannedMiles !== undefined) {
          setPlannedMilesInput(String(payload.plannedMiles));
        }
        if (payload.actualMiles !== undefined) {
          setActualMilesInput(String(payload.actualMiles));
        }

        toast.success('Dispatch updated');
        setEditOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update dispatch');
      }
    });
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

  // Recurrence info for display
  const recurrenceSummary = dispatch.routeTemplateId
    ? formatRecurrenceRule(
        dispatch.routeTemplateRecurrenceRule ?? null,
        dispatch.routeTemplateRecurrenceTimezone ?? null,
        dispatch.routeTemplateScheduledDepartureTime ?? null,
      )
    : null;

  const editSelectedTemplate = templates.find((t) => t.id === editForm.routeTemplateId) ?? null;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      {/* Top row: dispatch number + status badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{dispatchNumber}</h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {statusLabel}
          </span>

          {/* Recurring badge */}
          {dispatch.routeTemplateId && (
            <>
              <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2.5 py-0.5 text-xs font-medium">
                <RefreshCw className="h-3 w-3 mr-1" />
                Recurring
              </span>
              {dispatch.routeTemplateName && (
                <Link
                  href={`/carrier/templates/${dispatch.routeTemplateId}`}
                  className="text-sm text-primary hover:underline"
                >
                  {dispatch.routeTemplateName}
                </Link>
              )}
            </>
          )}
        </div>

        {/* Edit button + status actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit button — disabled when in_progress or completed/cancelled/tonu */}
          {isInProgress || isLocked ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border bg-background text-muted-foreground cursor-not-allowed opacity-50"
              title="Cannot edit an active or completed dispatch"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={openEditDialog}
              className="inline-flex items-center gap-1.5"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </Button>
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

      {/* Recurrence summary row */}
      {recurrenceSummary && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 text-purple-500" />
          <span>Recurrence: {recurrenceSummary}</span>
        </div>
      )}

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

      {/* Edit Dispatch Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit Dispatch{dispatchNumber !== '—' ? ` ${dispatchNumber}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dispatch.status === 'planned' && (
              <>
                {/* Route Template */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Route Template</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editForm.routeTemplateId}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, routeTemplateId: e.target.value }))
                    }
                  >
                    <option value="">No template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.templateName}{t.client ? ` — ${t.client.name}` : ''}
                      </option>
                    ))}
                  </select>
                  {/* Warning when changing template */}
                  {editForm.routeTemplateId !== (dispatch.routeTemplateId ?? '') && editForm.routeTemplateId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1 pt-0.5">
                      <span className="shrink-0 mt-0.5">⚠</span>
                      Changing the template will replace all existing stops on this dispatch.
                    </p>
                  )}
                  {/* Stop preview for newly selected template */}
                  {editSelectedTemplate && editSelectedTemplate.stops.length > 0 &&
                    editForm.routeTemplateId !== (dispatch.routeTemplateId ?? '') && (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-2.5 space-y-1">
                      {editSelectedTemplate.stops.map((stop) => (
                        <div key={stop.sequenceOrder} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">Stop {stop.sequenceOrder}</span>
                          <span className="text-foreground truncate">
                            {stop.facility.name}
                            {(stop.facility.city || stop.facility.state) && (
                              <span className="text-muted-foreground">
                                {' '}({[stop.facility.city, stop.facility.state].filter(Boolean).join(', ')})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Primary Driver</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editForm.primaryDriverId}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        primaryDriverId: e.target.value,
                        // Clear co-driver if it matches the newly selected primary
                        coDriverId: f.coDriverId === e.target.value ? '' : f.coDriverId,
                      }))
                    }
                  >
                    {allDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Co-Driver</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editForm.coDriverId}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, coDriverId: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {allDrivers
                      .filter((d) => d.id !== editForm.primaryDriverId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Truck</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editForm.truckId}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, truckId: e.target.value }))
                    }
                  >
                    {allTrucks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.unitNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scheduled Departure</label>
              <input
                type="datetime-local"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={editForm.scheduledDeparture}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, scheduledDeparture: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Planned Miles</label>
                <input
                  type="number"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editForm.plannedMiles}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, plannedMiles: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Actual Miles</label>
                <input
                  type="number"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editForm.actualMiles}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, actualMiles: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Dispatch notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
