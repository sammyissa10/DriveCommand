'use client';

/**
 * Assignment and commit (spec Section 11) — the screen.
 *
 * ```
 *  +--------------------------------------------------+
 *  | <- Finish trip                          12 stops |
 *  +--------------------------------------------------+
 *  | Driver    Marcus Webb    Available · 6h 30m left |
 *  |           Dana Okoro     On a trip that day      |  <- blocked
 *  | Truck     104            Ready                   |
 *  | Trailer   T-22           optional                |
 *  | Starts    Tue 26 Aug, 05:30                      |
 *  | Ends at   Home base — Waukesha Yard              |
 *  +--------------------------------------------------+
 *  | ! 2 things to know                        [ x ]  |  <- one dismissible
 *  +--------------------------------------------------+   summary, never modal
 *        +-> [ Create trip ]  disabled
 *            "Marcus Webb's CDL expired on 12 Aug 2026"
 * ```
 *
 * ---------------------------------------------------------------------------
 * THE VALIDATION SHOWN HERE IS NOT THE VALIDATION THAT MATTERS
 * ---------------------------------------------------------------------------
 * Every verdict on this screen comes from the server — `GET .../commit` runs
 * the same `validateCommit` the POST does. The disabled button is a courtesy so
 * a dispatcher is not made to submit to find out; the control is in
 * `commitImport`. Nothing here re-derives a block, so the two cannot disagree
 * about whether a trip may go, or about the words for why not.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PICKERS RE-FETCH ON EVERY CHANGE
 * ---------------------------------------------------------------------------
 * Availability is a function of the PLANNED DAY. A driver free on Tuesday is
 * double-booked on Wednesday, so changing the start time has to change the
 * picker — and computing that client-side would mean shipping every trip on the
 * books to the browser. One request per change, and the response is the whole
 * screen, which is the same contract the stop review screen uses (Phase 5): no
 * local copy exists that could survive a round trip out of step.
 *
 * ---------------------------------------------------------------------------
 * WARNINGS ARE ONE DISMISSIBLE SUMMARY. NEVER A MODAL.
 * ---------------------------------------------------------------------------
 * Section 10's rule, inherited by Section 11. A modal per warning is how a
 * dispatcher learns to click through warnings without reading them.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Check, ChevronLeft, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  AssignmentInput,
  CommitOutcome,
  CommitPreview,
  DriverOption,
  TruckOption,
} from '@/lib/document-import/commit-service';

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in LOCAL time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentScreen({
  importId,
  initial,
  title,
}: {
  importId: string;
  initial: CommitPreview;
  title: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<CommitPreview>(initial);
  const [assignment, setAssignment] = useState<AssignmentInput>(initial.assignment);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = useCallback(
    async (next: AssignmentInput) => {
      setBusy(true);
      setFailure(null);
      try {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(next)) {
          if (typeof v === 'string' && v) qs.set(k, v);
        }
        const res = await fetch(`/api/v1/carrier/document-imports/${importId}/commit?${qs}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data) setView(json.data as CommitPreview);
        else setFailure(json.error ?? 'Could not refresh availability.');
      } catch {
        setFailure('Could not reach the server. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    },
    [importId],
  );

  // Debounced so typing into the time field does not fire a request per digit.
  useEffect(() => {
    const t = setTimeout(() => void refresh(assignment), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assignment.primaryDriverId,
    assignment.truckId,
    assignment.trailerId,
    assignment.scheduledDeparture,
  ]);

  function set<K extends keyof AssignmentInput>(key: K, value: AssignmentInput[K]) {
    setAssignment((a) => ({ ...a, [key]: value }));
  }

  async function commit() {
    setCommitting(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignment),
      });
      const json = await res.json().catch(() => ({}));
      const outcome = json.data as CommitOutcome | undefined;

      if (res.ok && outcome?.ok) {
        // The import page is where the post-commit template offer lives, and
        // where the committed state is described.
        router.push(`/carrier/imports/${importId}`);
        router.refresh();
        return;
      }

      if (outcome && !outcome.ok && outcome.reason === 'BLOCKED') {
        // The server refused. Adopt ITS verdict rather than keeping ours — if
        // the two ever differ, the server is right by definition.
        setView((v) => ({ ...v, validation: outcome.validation }));
        setFailure(outcome.validation.blockedReason ?? 'This trip cannot be created yet.');
        return;
      }

      if (outcome && !outcome.ok && outcome.reason === 'FAILED') {
        // Plain language, from the server, naming the step. The import is back
        // in review and nothing was created.
        setFailure(outcome.message);
        return;
      }

      setFailure(json.error ?? 'Could not create the trip.');
    } catch {
      setFailure('Could not reach the server. Nothing was created.');
    } finally {
      setCommitting(false);
    }
  }

  const v = view.validation;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-28">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0">
          <Link href={`/carrier/imports/${importId}/stops`} aria-label="Back to stops">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">Finish trip</h1>
          <p className="truncate text-xs text-muted-foreground">{title}</p>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">
          {view.stopCount} stop{view.stopCount === 1 ? '' : 's'}
        </span>
      </div>

      {/* ---- Driver. Availability inline, so there is no second screen. ---- */}
      <section className="rounded-xl bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-foreground">Driver</h2>
        <div className="space-y-2">
          {view.drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active drivers on the roster.</p>
          ) : null}
          {view.drivers.map((d) => (
            <PickerRow
              key={d.id}
              label={d.name}
              meta={`${d.availabilityLabel} · ${d.hoursLabel}${
                d.complianceFlags.length > 0 ? ` · ${d.complianceFlags.join(' · ')}` : ''
              }`}
              blocked={d.blocked}
              selected={assignment.primaryDriverId === d.id}
              onSelect={() => set('primaryDriverId', d.id)}
            />
          ))}
        </div>
      </section>

      {/* ---- Truck and trailer ---- */}
      <section className="rounded-xl bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-foreground">Truck</h2>
        <div className="space-y-2">
          {view.trucks.map((t) => (
            <TruckPickerRow
              key={t.id}
              truck={t}
              selected={assignment.truckId === t.id}
              onSelect={() => set('truckId', t.id)}
            />
          ))}
        </div>

        {view.trailers.length > 0 ? (
          <>
            <h2 className="mb-3 mt-5 text-sm font-medium text-foreground">
              Trailer <span className="font-normal text-muted-foreground">— optional</span>
            </h2>
            <div className="space-y-2">
              {view.trailers.map((t) => (
                <TruckPickerRow
                  key={t.id}
                  truck={t}
                  selected={assignment.trailerId === t.id}
                  onSelect={() => set('trailerId', assignment.trailerId === t.id ? null : t.id)}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      {/* ---- Start time and the end stop ---- */}
      <section className="space-y-4 rounded-xl bg-card p-4 shadow-sm">
        <div>
          <label
            htmlFor="scheduled-departure"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Planned start
          </label>
          <input
            id="scheduled-departure"
            type="datetime-local"
            value={toLocalInput(assignment.scheduledDeparture)}
            onChange={(e) =>
              set(
                'scheduledDeparture',
                e.target.value ? new Date(e.target.value).toISOString() : null,
              )
            }
            className="h-11 w-full rounded-lg bg-background px-3 text-sm text-foreground shadow-sm outline-none ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Appointment windows carried from a route template are calculated from this time.
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Ends at</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {view.endStopFacilityName
              ? view.endStopFacilityName
              : view.endStopPolicy === 'NONE'
                ? 'No end stop — this trip finishes at its last delivery'
                : 'Not resolved'}
          </p>
          <Link
            href={`/carrier/imports/${importId}`}
            className="mt-1 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Change where this trip ends
          </Link>
        </div>
      </section>

      {/* ---- Warnings: ONE dismissible summary. Never a modal. ---- */}
      {v.warnings.length > 0 && warningsOpen ? (
        <section className="rounded-xl bg-amber-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {v.warnings.length === 1
                  ? '1 thing to know before you create this trip'
                  : `${v.warnings.length} things to know before you create this trip`}
              </p>
              <ul className="mt-2 space-y-1.5">
                {v.warnings.map((w, i) => (
                  <li key={`${w.code}-${i}`} className="text-xs text-muted-foreground">
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setWarningsOpen(false)}
              aria-label="Dismiss warnings"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}

      {failure ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {failure}
        </p>
      ) : null}

      {/* ---- The primary action ---- */}
      <div className="border-t border-border pt-4">
        <Button
          className="h-12 w-full text-base"
          disabled={!v.canCommit || busy || committing}
          onClick={() => void commit()}
        >
          {committing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating trip…
            </>
          ) : (
            <>
              Create trip
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        {/* The reason, inline and NAMED. A disabled button that will not say
            why is the thing dispatchers report as "it's broken". */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {v.blockedReason ?? 'This creates the trip, its stops and its documents in one step.'}
        </p>
      </div>
    </div>
  );
}

/**
 * One picker row.
 *
 * `min-w-0` + `truncate` on the label, per quick-519: a `truncate`d string's
 * min-content is the WHOLE string, so without the zero-minimum a long facility
 * or driver name widens the row past its own card.
 */
function PickerRow({
  label,
  meta,
  blocked,
  selected,
  onSelect,
}: {
  label: string;
  meta: string;
  blocked: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  /*
    quick-561 — a blocked option cannot be chosen.

    It used to be fully selectable: `onClick` fired unconditionally and the
    refusal only surfaced further down the page, as a disabled Create button
    with a `blockedReason` beneath it. So a dispatcher could pick a truck whose
    insurance had expired, get no feedback at the point of the tap, and find out
    at the bottom of the form. The verdict was always right; it just arrived
    after the decision instead of on it.

    NOT `disabled={blocked}` — `blocked && !selected`. Availability is a
    function of the planned day and these pickers re-fetch on every change, so
    an option that was legal when it was picked can become blocked when the
    start time moves. Disabling it outright would leave that selection on screen
    and unremovable, which is worse than the problem being fixed. A selected
    row stays live so it can always be changed or, for the optional trailer,
    toggled off.

    The refusal logic itself is untouched: `validateCommit` on the server is
    still the only thing that decides, exactly as this file's header describes.
    This stops the selection; it does not re-derive the verdict.
  */
  const unselectable = blocked && !selected;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={unselectable}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        selected ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'bg-muted/40 hover:bg-muted'
      } ${unselectable ? 'cursor-not-allowed opacity-55 hover:bg-muted/40' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>
          {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {blocked ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Not available" />
      ) : null}
    </button>
  );
}

function TruckPickerRow({
  truck,
  selected,
  onSelect,
}: {
  truck: TruckOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <PickerRow
      label={truck.label}
      meta={`${truck.assignedToday ? 'On a trip that day' : 'Available'}${
        truck.complianceFlags.length > 0 ? ` · ${truck.complianceFlags.join(' · ')}` : ''
      }`}
      blocked={truck.blocked}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

// Re-exported for the driver row's type, so a change to the server shape is a
// compile error here rather than a silently missing field.
export type { DriverOption };
