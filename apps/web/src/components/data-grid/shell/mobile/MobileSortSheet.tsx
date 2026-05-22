/**
 * MobileSortSheet Component — iOS Action Sheet Style
 *
 * Bottom sheet for sorting options.
 * Shows available sort fields with ascending/descending toggles.
 */

'use client';

import { Check, ArrowUp, ArrowDown } from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { cn } from '@/lib/utils';

export interface MobileSortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: Array<{ id: string; label: string }>;
  currentSort?: { id: string; desc: boolean } | null;
  onSortChange?: (sort: { id: string; desc: boolean } | null) => void;
}

/**
 * MobileSortSheet provides sort options in an iOS-style bottom sheet.
 *
 * Design:
 * - List of sortable columns
 * - Checkmark + direction arrow for active sort
 * - Clear sort option at bottom
 * - Touch targets ≥44px
 */
export function MobileSortSheet({
  open,
  onOpenChange,
  options,
  currentSort,
  onSortChange,
}: MobileSortSheetProps) {
  const handleSelect = (id: string) => {
    if (currentSort?.id === id) {
      // Toggle direction
      onSortChange?.({ id, desc: !currentSort.desc });
    } else {
      // New sort, default ascending
      onSortChange?.({ id, desc: false });
    }
    onOpenChange(false);
  };

  const handleClear = () => {
    onSortChange?.(null);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Sort by">
      <div className="py-2">
        {options.map((option) => {
          const isActive = currentSort?.id === option.id;
          const isDesc = currentSort?.desc;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3',
                'hover:bg-[var(--grid-hover)] active:bg-[var(--grid-hover)]',
                'transition-colors',
                'min-h-[44px]' // Touch target
              )}
            >
              {/* Checkmark indicator */}
              <div className="w-6 flex justify-center">
                {isActive && (
                  <Check
                    className="h-5 w-5"
                    style={{ color: 'var(--grid-accent, #0A21C0)' }}
                    strokeWidth={2}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'flex-1 text-left text-base',
                  isActive ? 'font-medium' : 'font-normal'
                )}
                style={{
                  color: isActive
                    ? 'var(--grid-accent, #0A21C0)'
                    : 'var(--grid-ink, #141619)',
                  fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
                }}
              >
                {option.label}
              </span>

              {/* Direction indicator */}
              {isActive && (
                <div className="flex items-center gap-1">
                  {isDesc ? (
                    <ArrowDown
                      className="h-4 w-4"
                      style={{ color: 'var(--grid-accent, #0A21C0)' }}
                      strokeWidth={1.6}
                    />
                  ) : (
                    <ArrowUp
                      className="h-4 w-4"
                      style={{ color: 'var(--grid-accent, #0A21C0)' }}
                      strokeWidth={1.6}
                    />
                  )}
                  <span
                    className="text-xs"
                    style={{ color: 'var(--grid-n500, #6B6E78)' }}
                  >
                    {isDesc ? 'Z-A' : 'A-Z'}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {/* Clear sort */}
        {currentSort && (
          <>
            <div className="my-2 border-t border-[var(--grid-border-header)]" />
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                'w-full flex items-center justify-center px-4 py-3',
                'hover:bg-[var(--grid-hover)] active:bg-[var(--grid-hover)]',
                'transition-colors',
                'min-h-[44px]'
              )}
            >
              <span
                className="text-base"
                style={{
                  color: 'var(--grid-status-danger, #FF3B30)',
                  fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
                }}
              >
                Clear Sort
              </span>
            </button>
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
}
