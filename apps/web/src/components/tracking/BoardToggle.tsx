'use client';

/**
 * Phase 11 — the Drivers / Trucks segmented toggle.
 *
 * A separate component from `ViewToggle` (map / list) rather than a
 * generalisation of it, for one concrete reason: `ViewToggle` animates its
 * indicator with `layoutId="view-toggle-indicator"`, and Framer Motion matches
 * `layoutId` GLOBALLY. Two toggles on the same screen sharing an id makes the
 * indicator fly between them. Its own id is the fix; merging them into one
 * component with a prop would work too and would buy nothing, since the two
 * have different option types and different owners.
 */

import { motion } from 'framer-motion';
import { Truck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BoardView = 'drivers' | 'trucks';

const OPTIONS: { key: BoardView; label: string; icon: typeof Users }[] = [
  { key: 'drivers', label: 'Drivers', icon: Users },
  { key: 'trucks', label: 'Trucks', icon: Truck },
];

export function BoardToggle({
  view,
  onViewChange,
  counts,
}: {
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  counts?: Record<BoardView, number>;
}) {
  return (
    <div
      className="relative flex items-center rounded-lg bg-muted p-1"
      role="radiogroup"
      aria-label="Board view"
    >
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const isActive = view === key;
        const count = counts?.[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onViewChange(key)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isActive && (
              <motion.div
                layoutId="board-toggle-indicator"
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
              {count !== undefined && (
                <span className="text-xs text-muted-foreground">{count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
