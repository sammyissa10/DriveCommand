'use client';

import { Search, X } from 'lucide-react';

/** Pill search field (radius 13, card fill) that appears on every Overview. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-[13px] bg-ds-card px-3">
      <Search className="h-5 w-5 shrink-0 text-ds-txt3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 flex-1 bg-transparent text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
        autoCapitalize="none"
        autoCorrect="off"
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="shrink-0"
        >
          <X className="h-4 w-4 text-ds-txt3" />
        </button>
      ) : null}
    </div>
  );
}
