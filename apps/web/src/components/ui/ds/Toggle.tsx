'use client';

import { cn } from '@/lib/utils';

/** Fill used when the toggle is on. Accent = a normal option; warning = a hazard. */
export type ToggleTone = 'accent' | 'warning';

const ON_FILL: Record<ToggleTone, string> = {
  accent: 'bg-ds-accent text-white',
  warning: 'bg-ds-warning text-white',
};

/**
 * A boolean the user flips: BOL/POD required, Hazmat, Brokered, a weekday in a
 * recurrence rule. Height 44 (touch), radius 12, `ds.input` when off.
 *
 * Always `flex-1` — wrap in a flex row. One on its own gets `<div className="flex">`,
 * a pair or a week of them share `<div className="flex gap-2">`.
 *
 * `tone="warning"` is for flags that mean caution (Hazmat). Accent means live or
 * primary in this system, so spending it on a hazard reads wrong (§1).
 */
export function Toggle({
  label,
  on,
  onChange,
  tone = 'accent',
  disabled = false,
  ariaLabel,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  tone?: ToggleTone;
  disabled?: boolean;
  /** When the visible label is an abbreviation (e.g. "M" for Monday). */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'h-11 min-w-0 flex-1 rounded-[12px] text-[15px] font-semibold transition active:opacity-75',
        on ? ON_FILL[tone] : 'bg-ds-input text-ds-txt2',
        disabled && 'opacity-35',
      )}
    >
      {label}
    </button>
  );
}
