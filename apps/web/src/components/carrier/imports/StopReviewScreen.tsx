'use client';

/**
 * Stop review (spec Section 10) — the screen.
 *
 * ```
 *  +--------------------------------------------------+
 *  | <- Stops                                  12     |
 *  +--------------------------------------------------+
 *  | :: 1  Russ Darrow Nissan   ok linked   5 · 2ref  |
 *  | :: 3  Hall Ford            ~ proposed  2 · 1ref  | <- tap
 *  +--------------------------------------------------+
 *  | [x] 3 selected  Note v  Docs v  Window v  Clear  |
 *  +--------------------------------------------------+
 *        |
 *        +-> [ Create trip ]  disabled
 *            "2 stops need a facility"
 * ```
 *
 * ---------------------------------------------------------------------------
 * WHERE THE STATE LIVES
 * ---------------------------------------------------------------------------
 * On the server. Every reorder, edit and bulk apply is a request that returns
 * the whole view, and this component replaces its state with what came back
 * rather than merging its own optimism into it. So leaving the page and coming
 * back shows the same order — which is Phase 5's second stated drift risk, and
 * it is answered by there being no local copy that could survive the round trip
 * out of step.
 *
 * The ONE exception is the drag itself: the list is moved locally the instant
 * the pointer is released, because a list that snaps back for 200ms while a POST
 * lands reads as a failed drag. If the POST fails the previous order is restored
 * and the error is shown — an optimistic move that cannot silently stick.
 *
 * ---------------------------------------------------------------------------
 * SELECTION
 * ---------------------------------------------------------------------------
 * `useGridSelection` from the DataGrid, used standalone. It is a real primitive
 * — a Set of ids in a store keyed by grid, with shift-range support — and using
 * it means a 16-stop reorder can be selected with two clicks rather than nine.
 * What it is NOT is a table, and this list is not a table: it drags, and the
 * DataGrid's rows do not.
 *
 * The Set is what the bulk bar is handed. It is never derived from what is
 * rendered, so a selected stop below the fold is in it exactly like one on
 * screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertTriangle, ArrowRight, ChevronLeft, Info, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useGridSelection } from '@/components/data-grid';
import type { StopReviewView } from '@/lib/document-import/stop-review';
import { StopReviewRowItem } from './StopReviewRow';
import { StopDetailEditor } from './StopDetailEditor';
import { StopBulkBar, type BulkPayload } from './StopBulkBar';

const GRID_ID = 'document-import-stop-review';

export function StopReviewScreen({
  importId,
  initial,
  title,
}: {
  importId: string;
  initial: StopReviewView;
  title: string;
}) {
  const [view, setView] = useState<StopReviewView>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(true);

  const selection = useGridSelection(GRID_ID);

  // The store is module-scoped and outlives a navigation, so a selection left
  // behind on another import would come back here. Cleared on mount.
  useEffect(() => {
    selection.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [importId]);

  const rowIds = useMemo(() => view.stops.map((s) => String(s.index)), [view.stops]);
  const selected = useMemo(
    () =>
      Array.from(selection.selectedIds)
        .map((id) => Number(id))
        .filter((n) => Number.isInteger(n))
        .sort((a, b) => a - b),
    [selection.selectedIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/v1/carrier/document-imports/${importId}/stops/review`);
    if (!res.ok) return;
    const json = await res.json();
    setView(json.data as StopReviewView);
  }, [importId]);

  /** One place for every mutation: send, replace state, report honestly. */
  const send = useCallback(
    async (path: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/carrier/document-imports/${importId}/stops${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'That did not save.');
        return json.data;
      } finally {
        setBusy(false);
      }
    },
    [importId],
  );

  // ---- reorder -------------------------------------------------------------

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = view.stops.findIndex((s) => String(s.index) === String(active.id));
    const to = view.stops.findIndex((s) => String(s.index) === String(over.id));
    if (from === -1 || to === -1) return;

    const previous = view;
    const moved = arrayMove(view.stops, from, to);
    // `order` is the OLD index of each stop in its NEW position — the full
    // permutation the server validates, not a move delta.
    const order = moved.map((s) => s.index);

    // Optimistic, and only the order. Sequence numbers are re-derived so the
    // list does not show 1,3,2 for the length of a round trip.
    setView({ ...view, stops: moved.map((s, i) => ({ ...s, sequence: i + 1 })) });

    // The selection is by index, and every index has just changed. Map it
    // through the same permutation so the stops a person selected are still the
    // stops that are selected — losing the selection on every drag would make
    // "select, reorder, bulk apply" impossible.
    const remapped = new Set(
      selected
        .map((oldIndex) => order.indexOf(oldIndex))
        .filter((i) => i >= 0)
        .map(String),
    );

    try {
      const next = (await send('/order', 'POST', { order })) as StopReviewView;
      setView(next);
      selection.selectAll(Array.from(remapped));
    } catch (e) {
      setView(previous);
      setError(e instanceof Error ? e.message : 'Could not save the new order.');
    }
  }

  // ---- bulk ----------------------------------------------------------------

  async function applyBulk(payload: BulkPayload, confirmation: string) {
    try {
      const result = (await send('/bulk', 'POST', { stopIndexes: selected, ...payload })) as {
        view: StopReviewView;
        applied: number;
        skipped: number[];
      };
      setView(result.view);

      // Say what actually happened rather than repeating the question. If four
      // of seven stops took the change, four is the number the dispatcher needs.
      const skipped = result.skipped.length;
      setNotice(
        skipped === 0
          ? `Applied to ${result.applied} stop${result.applied === 1 ? '' : 's'}.`
          : `Applied to ${result.applied} of ${selected.length}. ` +
              `Stop${skipped === 1 ? '' : 's'} ${result.skipped.map((i) => i + 1).join(', ')} had nothing to change.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not do that. (${confirmation})`);
    }
  }

  // ---- render --------------------------------------------------------------

  const blockedIndexes = useMemo(
    () => new Set(view.blocks.flatMap((b) => b.stopIndexes)),
    [view.blocks],
  );

  const allSelected = selected.length > 0 && selected.length === view.stops.length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-24">
      {/* ---- header ---- */}
      <div className="flex items-center gap-3">
        <Link
          href={`/carrier/imports/${importId}`}
          aria-label="Back to the import"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Stops</h1>
          <p className="truncate text-sm text-muted-foreground">{title}</p>
        </div>
        <span className="shrink-0 text-2xl font-semibold tabular-nums text-muted-foreground">
          {view.total}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{view.note}</p>

      {/* ---- one dismissible warning summary. Never a modal. ---- */}
      {view.warnings.length > 0 && warningsOpen ? (
        <div className="rounded-xl bg-muted/60 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {view.warnings.length} thing{view.warnings.length === 1 ? '' : 's'} worth a look.
                None of them stops you.
              </p>
              <ul className="mt-2 space-y-1.5">
                {view.warnings.map((w) => (
                  <li key={w.code} className="text-xs text-muted-foreground">
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setWarningsOpen(false)}
              aria-label="Dismiss warnings"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-foreground">{error}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm text-foreground">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* ---- select all ---- */}
      {view.stops.length > 0 ? (
        <div className="flex items-center gap-3 px-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <Checkbox
              checked={allSelected}
              aria-label={allSelected ? 'Clear selection' : 'Select every stop'}
              onCheckedChange={(v) =>
                v === true ? selection.selectAll(rowIds) : selection.clearSelection()
              }
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : 'Select stops to change several at once'}
          </span>
          {busy ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : null}

      {/* ---- the list ---- */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-border">
            {view.stops.map((row) => (
              <div key={row.index}>
                <StopReviewRowItem
                  row={row}
                  selected={selection.isSelected(String(row.index))}
                  disabled={busy}
                  hasIssue={blockedIndexes.has(row.index)}
                  onToggleSelect={(event) =>
                    // A checkbox list always TOGGLES. `useGridSelection` treats a
                    // plain click as "replace the selection", which is right for
                    // a spreadsheet row and wrong for a checkbox, so meta is
                    // asserted here. Shift is passed through untouched, so
                    // shift-click still selects a range.
                    selection.selectRow(
                      String(row.index),
                      { shiftKey: event.shiftKey, metaKey: true, ctrlKey: true } as React.MouseEvent,
                      rowIds,
                    )
                  }
                  onOpen={() => setOpenIndex(openIndex === row.index ? null : row.index)}
                />
                {openIndex === row.index ? (
                  <div className="px-3 pb-4">
                    <StopDetailEditor
                      importId={importId}
                      row={row}
                      onSaved={(next) => setView(next as StopReviewView)}
                      onFacilityResolved={() => void reload()}
                      onClose={() => setOpenIndex(null)}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {view.stops.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">
          No stops were read from this document. Re-shoot the pages from the import screen.
        </p>
      ) : null}

      {/* ---- the bulk bar. Handed the selection and nothing else. ---- */}
      <StopBulkBar
        selected={selected}
        busy={busy}
        onApply={applyBulk}
        onClearSelection={() => selection.clearSelection()}
      />

      {/* ---- the single primary action ---- */}
      <div className="pt-2">
        <Button className="h-12 w-full text-base" disabled={!view.canProceed || busy}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {/* The reason, inline and named — not a tooltip, not a toast on press.
            A disabled button that will not say why is the thing dispatchers
            report as "it's broken". */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {view.blockedReason
            ? view.blockedReason
            : 'Route matching and assignment arrive in the next phases.'}
        </p>
      </div>
    </div>
  );
}
