'use client';

import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
}

/**
 * Native-iOS segmented control: track = card fill, selected thumb = elevated
 * fill (radius 11/9). Used for list filters and detail tabs.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-[11px] bg-ds-card p-1">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-9 flex-1 rounded-[9px] text-[13px] transition',
              selected ? 'bg-ds-elevated font-semibold text-ds-txt' : 'text-ds-txt2',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
