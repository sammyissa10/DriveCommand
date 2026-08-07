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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { StopReviewRow as Row } from '@/lib/document-import/stop-review';
import { StopStatus } from './StopResolutionList';
import { TruncatedText } from './TruncatedText';

export function StopReviewRowItem({
  row,
  selected,
  disabled,
  hasIssue,
  onToggleSelect,
  onOpen,
}: {
  row: Row;
  selected: boolean;
  disabled: boolean;
  /** True when a block names this stop — the row gets a marker, not a red box. */
  hasIssue: boolean;
  onToggleSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
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
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-3 transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/50',
        isDragging && 'bg-muted shadow-lg',
      )}
    >
      {/* Drag handle. Its own 44px target so a drag never starts from a tap
          meant for the row, and never from the checkbox. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${primary}`}
        disabled={disabled}
        className={cn(
          'flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
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

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        aria-label={`Open ${primary}`}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            <TruncatedText value={primary || 'Unnamed stop'} />
          </span>
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
      </button>

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

      <StopStatus stop={row} />
    </li>
  );
}

export const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel stop',
  layover: 'Layover',
  relay_handoff: 'Relay handoff',
};
