'use client';

/**
 * One row of the stop list (spec Section 10).
 *
 * ```
 *  | :: 1  Russ Darrow Nissan   ok linked   5 · 2ref  |
 * ```
 *
 * A drag handle, the sequence, the facility name, the resolution badge, the
 * quantity rollup and the reference count — exactly the five things the spec
 * draws, in that order. Tapping anywhere that is not the handle or the checkbox
 * opens the detail editor.
 *
 * DESIGN (Section 15). No border: the row separates from the page by surface
 * contrast and from its neighbours by a hairline divider, not a box. Padding is
 * 12/16. The badge is colour AND icon AND text and comes from
 * `StopResolutionList` rather than being redrawn here, so "a new badge is not
 * red" is decided in one place. The only accent-coloured control on this screen
 * is the single primary action at the bottom — this row's buttons are all
 * neutral.
 *
 * DRAG uses `@dnd-kit/sortable`, already installed and already doing exactly
 * this for carrier stops in `StopBuilder.tsx`. Nothing was installed for it.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Hash, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { StopReviewRow as Row } from '@/lib/document-import/stop-review';
import { StopStatus } from './StopResolutionList';

export function StopReviewRowItem({
  row,
  selected,
  disabled,
  hasIssue,
  onToggleSelect,
  onOpen,
  onSetSkipped,
}: {
  row: Row;
  selected: boolean;
  disabled: boolean;
  /** True when a block names this stop — the row gets a marker, not a red box. */
  hasIssue: boolean;
  onToggleSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
  /** Section 8's "one tap to keep" for a stop that is not on today's manifest. */
  onSetSkipped: (skipped: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(row.index),
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // The name the row leads with is the FACILITY once one is linked, and the
  // document's name until then. A dispatcher scanning the list is looking for
  // where the truck goes, and after a link that is the facility's name — but
  // before a link, showing a facility name would be claiming one.
  const primary = row.facility?.name ?? row.name ?? row.documentName;

  return (
    /*
     * A <div>, not an <li> (quick-513). The screen wraps each row together with
     * its detail panel in the <li>, because `ul` admits only `li` as a child and
     * the wrapper used to be a `div` — `ul > div > li`, which the parser also
     * rejects. One element owns the list-item semantics, and it is the wrapper.
     */
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-3 transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/50',
        isDragging && 'bg-muted shadow-lg',
        // A skipped stop is dimmed, not hidden and not struck through: it is
        // still a row someone can act on, and it is deliberately still legible.
        row.skipped && 'opacity-60',
      )}
    >
      {/*
       * THE OPEN TARGET, AND IT HAS NO CHILDREN (quick-513).
       *
       * This used to be a <button> wrapped around the name and address, with the
       * name's own expander button inside it. `<button>` forbids interactive
       * descendants, so the parser broke the nesting and the inner control never
       * saw a click.
       *
       * An overlay fixes it structurally rather than by being careful: a button
       * with nothing inside it cannot nest anything. It is absolutely positioned
       * with `z-index: auto`, so it paints above the row's in-flow, NON-positioned
       * content (the name, the address, the counts) and clicking any of that
       * opens the row. Every interactive sibling below carries `relative` and
       * comes later in DOM order, so it paints above the overlay and receives its
       * own clicks — and because the overlay is a SIBLING rather than an
       * ancestor, nothing bubbles to it and no stopPropagation is needed for it.
       *
       * Keeping it a real <button> rather than a div[role="button"] means Enter
       * and Space work natively, with no hand-rolled key handling to get wrong.
       */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${primary}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Drag handle. Its own 44px target so a drag never starts from a tap
          meant for the row, and never from the checkbox. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${primary}`}
        disabled={disabled}
        className={cn(
          'relative flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={selected}
          disabled={disabled}
          aria-label={`Select ${primary}`}
          // dnd-kit puts a pointer sensor on the row; stopping propagation here
          // keeps a click on the box from also starting a drag.
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e);
          }}
        />
      </span>

      <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{row.sequence}</span>

      {/*
       * Not positioned, and therefore UNDER the overlay — clicking the name or
       * the address opens the row, which is what a dispatcher expects.
       *
       * The name is plain truncated text with a `title`, not the interactive
       * `TruncatedText` expander it used to be. That expander was the nested
       * button, and putting it back above the overlay would trade one broken
       * control for another: it is `block w-full`, so it would cover the name —
       * the single most likely place someone clicks to open a stop. The Phase 5
       * rule still holds, because opening the row IS the tap that reveals the
       * full value: the detail editor's header and facility field both render it
       * in full, and the editor's own expander is untouched.
       */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex w-full min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={primary || 'Unnamed stop'}
          >
            {primary || 'Unnamed stop'}
          </span>
          {/*
           * Template badges (spec Section 8). `outline`, never red: Section 15
           * reserves red for errors and destructive actions, and it names this
           * exact case — "a 'new' badge does not qualify". Both carry words, so
           * neither depends on colour to be understood.
           */}
          {row.templateOrigin === 'IMPORT_ONLY' ? (
            <Badge variant="outline" className="shrink-0">
              New
            </Badge>
          ) : null}
          {row.templateOrigin === 'TEMPLATE_ONLY' ? (
            <Badge variant="outline" className="shrink-0">
              Not on today&apos;s manifest
            </Badge>
          ) : null}
          {hasIssue ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">needs a look</span>
          ) : null}
        </span>
        <span className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {row.stopType ? <span className="shrink-0">{STOP_TYPE_LABEL[row.stopType]}</span> : null}
          <span className="min-w-0 flex-1 truncate">
            {row.facility?.address || row.documentAddress || 'No address on the document'}
          </span>
        </span>
      </div>

      {/* Quantity rollup, with the override mark Section 10 asks for. */}
      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
        {row.rollups.label}
        {row.rollups.pieces.overridden || row.rollups.weight.overridden ? (
          <Lock className="h-3 w-3" aria-label="Quantity typed by hand" />
        ) : null}
      </span>

      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
        <Hash className="h-3 w-3" />
        {row.referenceCount}
        <span className="sr-only">
          {row.referenceCount === 1 ? 'reference' : 'references'}
        </span>
        <span aria-hidden>ref</span>
      </span>

      {/*
       * The status badge, and the "+ New is dead" half of quick-513.
       *
       * It was NOT dead because of the nesting — it is a sibling of the old open
       * button, not a descendant, and `Badge` renders a <div>. It never
       * responded to clicks because it has never been a control: Section 15 makes
       * status colour + icon + text, and that is what it is.
       *
       * A settled status is still not a call to action, so LINKED keeps the plain
       * badge. An unresolved one is the entire reason the row is asking for
       * attention, so PROPOSED and NEW get a real button that opens the row —
       * where the facility resolution actually lives. `relative` puts it above
       * the overlay; the resolution UI in the detail editor is untouched.
       */}
      {/*
       * "Defaulted to skipped, one tap to keep" (Section 8) — and the tap is a
       * real <button>, `relative` so it paints above the overlay, with
       * stopPropagation so keeping a stop does not also open it. A skipped row
       * shows this INSTEAD of the resolution badge: an unconfirmed facility is
       * not a question worth asking about a stop that is not on the trip.
       */}
      {row.templateOrigin === 'TEMPLATE_ONLY' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetSkipped(!row.skipped);
          }}
          disabled={disabled}
          className="relative min-h-[44px] shrink-0 rounded px-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {row.skipped ? 'Keep this stop' : 'Skip it'}
        </button>
      ) : row.requiresHumanTap ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`Resolve the facility for ${primary}`}
          className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StopStatus stop={row} />
        </button>
      ) : (
        <StopStatus stop={row} />
      )}
    </div>
  );
}

export const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel stop',
  layover: 'Layover',
  relay_handoff: 'Relay handoff',
};
