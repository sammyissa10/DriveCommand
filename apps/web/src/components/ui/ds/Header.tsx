'use client';

import { Plus } from 'lucide-react';

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
 * Overview header: large title + live count, add button top-right.
 */
export function LargeTitleHeader({
  title,
  subtitle,
  onAdd,
  addLabel,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between pb-4 pt-2">
      <div className="min-w-0 pr-3">
        <h1 className="text-[34px] font-bold leading-tight text-ds-txt">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-ds-txt2">{subtitle}</p> : null}
      </div>
      {onAdd ? <AddButton onClick={onAdd} label={addLabel ?? `Add ${title}`} /> : null}
    </div>
  );
}
