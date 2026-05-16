'use client';

import { motion } from 'framer-motion';
import { Map, List } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewMode = 'map' | 'list';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const OPTIONS: { key: ViewMode; label: string; icon: typeof Map }[] = [
  { key: 'map', label: 'Map', icon: Map },
  { key: 'list', label: 'List', icon: List },
];

export default function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div
      className="relative flex items-center rounded-lg bg-muted p-1"
      role="radiogroup"
      aria-label="View mode"
    >
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const isActive = view === key;

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onViewChange(key)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="view-toggle-indicator"
                className="absolute inset-0 bg-background rounded-md shadow-sm"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="h-4 w-4" />
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
