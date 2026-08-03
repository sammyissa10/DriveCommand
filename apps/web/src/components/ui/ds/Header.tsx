'use client';

import type { ComponentType, ReactNode } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';

/** Top-right tinted circle that opens Quick Create. Never a FAB. */
export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-accent/[0.16] transition active:opacity-75"
    >
      <Plus className="h-5 w-5 text-ds-accent" />
    </button>
  );
}

/**
 * Same circle, any icon, and a tone.
 *
 * A screen with two top-right actions must still have only ONE in the accent
 * colour (Section 15: "one accent colour on one primary action"). The second
 * takes `tone="neutral"` and reads as available rather than as the thing to do.
 */
export function ActionButton({
  onClick,
  label,
  icon: Icon,
  tone = 'accent',
}: {
  onClick: () => void;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'accent' | 'neutral';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        tone === 'accent'
          ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-accent/[0.16] transition active:opacity-75'
          : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-avatar transition active:opacity-75'
      }
    >
      <Icon className={tone === 'accent' ? 'h-[18px] w-[18px] text-ds-accent' : 'h-[18px] w-[18px] text-ds-txt2'} />
    </button>
  );
}

/**
 * Overview header: large title + live count, add button top-right.
 *
 * `onBack` is for overviews that are pushed sub-pages (reached from the More
 * menu) rather than bottom-tab roots — a chevron sits above the large title, as
 * on iOS. Tab roots (Dashboard, Trips, Loads, Live Map) omit it.
 */
export function LargeTitleHeader({
  title,
  subtitle,
  onAdd,
  addLabel,
  onBack,
  backLabel = 'Back',
  trailing,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  addLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  /**
   * Extra top-right controls, rendered to the LEFT of the add button so the
   * primary action keeps the rightmost, thumb-nearest position. Use
   * `ActionButton` with `tone="neutral"` for these.
   */
  trailing?: ReactNode;
}) {
  return (
    <>
      {onBack ? (
        <div className="flex h-11 items-center">
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 flex h-11 w-11 items-center justify-center transition active:opacity-75"
          >
            <ChevronLeft className="h-6 w-6 text-ds-accent" />
          </button>
        </div>
      ) : null}
      <div className="flex items-start justify-between pb-4 pt-2">
        <div className="min-w-0 pr-3">
          <h1 className="text-[34px] font-bold leading-tight text-ds-txt">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-ds-txt2">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          {onAdd ? <AddButton onClick={onAdd} label={addLabel ?? `Add ${title}`} /> : null}
        </div>
      </div>
    </>
  );
}
