'use client';

/**
 * Assignment and commit (spec Section 11) — the screen.
 *
 * ```
 *  +--------------------------------------------------+
 *  | <- Finish trip                          12 stops |
 *  +--------------------------------------------------+
 *  | Driver   [ Marcus Webb                       v ] |  <- SearchableSelect
 *  |          Available · 6h 30m left                 |  <- the selection, said
 *  | Truck    [ 104 — Freightliner Cascadia       v ] |     in full
 *  |          Available                               |
 *  | Starts   Tue 26 Aug, 05:30                       |
 *  | Ends at  Home base — Waukesha Yard               |
 *  +--------------------------------------------------+
 *  | ! 2 things to know                        [ x ]  |  <- one dismissible
 *  +--------------------------------------------------+   summary, never modal
 *        +-> [ Create trip ]  disabled
 *            "Marcus Webb's CDL expired on 12 Aug 2026"
 *
 *  opened:  [ Search by name...                      ]
 *           v Marcus Webb   Available · 6h 30m left    (Available)
 *             Dana Okoro    On a trip that day · …     (On Trip)   dimmed
 * ```
 *
 * ---------------------------------------------------------------------------
 * THE PICKERS ARE `SearchableSelect`, AND THE DRAWING ABOVE IS WHAT SHIPS
 * ---------------------------------------------------------------------------
 * quick-563. This block used to draw a compact two-column form with availability
 * inline while the code beneath rendered fifteen trucks and seven drivers as
 * flat, unsearchable, unsorted, full-height lists — so both choices could never
 * be on screen at once. **The file disagreed with itself, and the drawing was
 * the half that was right.**
 *
 * Every complaint filed against this screen names something
 * `@/components/ui/searchable-select` already ships: search, per-option
 * `disabled`, status badges, and `sortByStatus`. No new component was written
 * and the shared one was not modified — `DispatchLoadModal` is its other
 * consumer and uses it for exactly this job, four times.
 *
 * The option mapping lives in `lib/document-import/assignment-options.ts`, with
 * the reasoning for each badge and the two things `SearchableSelect` cannot
 * express. One of those two shaped this screen: **the trigger renders `label`
 * and nothing else**, so collapsing a list would have deleted the availability,
 * hours and compliance text for the option actually chosen. That is what the
 * line under each picker is for. It is not a new feature — it is the inline
 * information the flat rows used to carry, kept where it can still be read.
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
import { AlertTriangle, ArrowRight, ChevronLeft, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  driverOptions,
  selectedDriver,
  selectedTruck,
  truckOptions,
  type AssignmentSelection,
} from '@/lib/document-import/assignment-options';
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

      {/* ---- Driver and truck. Both on screen at once, which is the point. ---- */}
      <section className="space-y-4 rounded-xl bg-card p-4 shadow-sm">
        <div>
          <h2 className="mb-1.5 text-sm font-medium text-foreground">Driver</h2>
          {view.drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active drivers on the roster.</p>
          ) : (
            <>
              <SearchableSelect
                options={driverOptions(view.drivers, assignment.primaryDriverId)}
                value={assignment.primaryDriverId ?? ''}
                onValueChange={(id) => set('primaryDriverId', id || null)}
                placeholder="Choose a driver…"
                searchPlaceholder="Search by name…"
                emptyMessage="No drivers found."
                disabled={committing}
                showStatus
                sortByStatus
              />
              <SelectionLine
                selection={selectedDriver(view.drivers, assignment.primaryDriverId)}
                empty="Nobody assigned yet."
              />
            </>
          )}
        </div>

        <div>
          <h2 className="mb-1.5 text-sm font-medium text-foreground">Truck</h2>
          {view.trucks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trucks in the fleet.</p>
          ) : (
            <>
              <SearchableSelect
                options={truckOptions(view.trucks, assignment.truckId)}
                value={assignment.truckId ?? ''}
                onValueChange={(id) => set('truckId', id || null)}
                placeholder="Choose a truck…"
                searchPlaceholder="Search by unit number…"
                emptyMessage="No trucks found."
                disabled={committing}
                showStatus
                sortByStatus
              />
              <SelectionLine
                selection={selectedTruck(view.trucks, assignment.truckId)}
                empty="No truck assigned yet."
              />
            </>
          )}
        </div>

        {/*
          Always empty today — `TRAILER_TYPES` is `new Set([])`, a reported gap
          rather than a silent removal, so this branch does not render. Kept
          because `trailerId` still round-trips and still writes
          `dispatches.trailer_id`; when a real trailer signal arrives this is
          already on the same picker as the other two.
        */}
        {view.trailers.length > 0 ? (
          <div>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Trailer <span className="font-normal text-muted-foreground">— optional</span>
            </h2>
            <SearchableSelect
              options={truckOptions(view.trailers, assignment.trailerId)}
              value={assignment.trailerId ?? ''}
              onValueChange={(id) => set('trailerId', id || null)}
              placeholder="None"
              searchPlaceholder="Search by unit number…"
              emptyMessage="No trailers found."
              disabled={committing}
              showStatus
              sortByStatus
            />
            <SelectionLine
              selection={selectedTruck(view.trailers, assignment.trailerId)}
              empty="No trailer — optional."
            />
          </div>
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
 * What the collapsed picker cannot say about the option it is showing.
 *
 * `SearchableSelect`'s trigger renders `selectedOption.label` and nothing else —
 * no badge, no `secondaryLabel` — so without this line, choosing a driver would
 * HIDE the availability, hours and compliance text that the flat rows showed
 * inline. Section 11's requirement is that the picker shows availability inline
 * "so no second screen is needed", and a collapsed trigger is a second screen
 * with extra steps. The text is `driverMeta` / `truckMeta`, the same functions
 * that fill `secondaryLabel`, so the line and the open list can never describe
 * the same option differently.
 *
 * `blocked` is marked here and NOT by disabling the option, which is the
 * visible half of quick-561's guard: availability re-fetches per planned day, so
 * a selection that was legal when it was made can go bad when the start time
 * moves. The option stays selectable so it can be changed; this is where a
 * dispatcher sees that it needs to be. `min-w-0` per quick-519.
 */
function SelectionLine({
  selection,
  empty,
}: {
  selection: AssignmentSelection | null;
  empty: string;
}) {
  if (!selection) {
    return <p className="mt-1.5 text-xs text-muted-foreground">{empty}</p>;
  }

  return (
    <p
      className={`mt-1.5 flex min-w-0 items-start gap-1.5 text-xs ${
        selection.blocked ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {selection.blocked ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : null}
      <span className="min-w-0">
        {selection.blocked ? `Not available — ${selection.meta}` : selection.meta}
      </span>
    </p>
  );
}

// Re-exported for the pickers' types, so a change to the server shape is a
// compile error here rather than a silently missing field.
export type { DriverOption, TruckOption };
