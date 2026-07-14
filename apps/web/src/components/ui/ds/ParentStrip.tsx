'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface ParentChip {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

/**
 * "Belongs to" strip: a section label + tappable chips (40 high, radius 13,
 * card fill, accent entity icon, name, chevron) that navigate UP to parent
 * records. Sits under the identity header and above the tabs. Parents live
 * here only — never as field rows or inline sections.
 *
 * Entity-agnostic: pass any set of {icon, label, onClick} chips (a Load + its
 * Client, a Driver's team, a Load's Client…). Renders nothing when empty.
 */
export function ParentStrip({ items }: { items: ParentChip[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">
        Belongs to
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            aria-label={`Open ${it.label}`}
            className="flex h-10 items-center gap-2 rounded-[13px] bg-ds-card px-3 transition active:opacity-75"
          >
            <it.icon className="h-4 w-4 shrink-0 text-ds-accent" />
            <span className="max-w-[180px] truncate text-[15px] text-ds-txt">{it.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" />
          </button>
        ))}
      </div>
    </div>
  );
}
