/**
 * MobileColumnsSheet Component — iOS Action Sheet Style
 *
 * Bottom sheet for showing/hiding columns.
 * Simple toggle list with Show all / Hide all options.
 */

'use client';

import { Eye, EyeOff } from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { cn } from '@/lib/utils';

export interface MobileColumnsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Array<{ id: string; name: string; isHidden: boolean; isHideable: boolean }>;
  onToggleColumn?: (columnId: string) => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
}

/**
 * MobileColumnsSheet provides column visibility toggles in an iOS-style bottom sheet.
 *
 * Design:
 * - List of columns with eye toggle icon
 * - Visible = Signal Blue eye, Hidden = muted eye-off
 * - Required columns shown but disabled
 * - Show all / Hide all footer links
 * - Touch targets ≥44px
 */
export function MobileColumnsSheet({
  open,
  onOpenChange,
  columns,
  onToggleColumn,
  onShowAll,
  onHideAll,
}: MobileColumnsSheetProps) {
  // Filter to only data columns (exclude select/actions)
  const dataColumns = columns.filter(
    (col) => col.id !== 'select' && col.id !== 'actions'
  );

  const visibleCount = dataColumns.filter((col) => !col.isHidden).length;
  const hiddenCount = dataColumns.filter((col) => col.isHidden).length;

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Show / Hide Columns">
      <div className="py-2">
        {dataColumns.map((column) => (
          <button
            key={column.id}
            type="button"
            onClick={() => column.isHideable && onToggleColumn?.(column.id)}
            disabled={!column.isHideable}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3',
              'hover:bg-[var(--grid-hover)] active:bg-[var(--grid-hover)]',
              'transition-colors',
              'min-h-[44px]', // Touch target
              !column.isHideable && 'opacity-50 cursor-not-allowed'
            )}
          >
            {/* Eye toggle icon */}
            <div className="w-6 flex justify-center">
              {column.isHidden ? (
                <EyeOff
                  className="h-5 w-5"
                  style={{ color: 'var(--grid-n400, #8E909A)' }}
                  strokeWidth={1.6}
                />
              ) : (
                <Eye
                  className="h-5 w-5"
                  style={{ color: 'var(--grid-accent, #0A21C0)' }}
                  strokeWidth={1.6}
                />
              )}
            </div>

            {/* Column name */}
            <span
              className={cn(
                'flex-1 text-left text-base',
                column.isHidden ? 'text-[var(--grid-n500)]' : 'text-[var(--grid-ink)]'
              )}
              style={{
                fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
              }}
            >
              {column.name}
            </span>

            {/* Required indicator */}
            {!column.isHideable && (
              <span
                className="text-xs"
                style={{ color: 'var(--grid-n400, #8E909A)' }}
              >
                Required
              </span>
            )}
          </button>
        ))}

        {/* Show all / Hide all footer */}
        <div className="mt-2 border-t border-[var(--grid-border-header)]" />
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => {
              onShowAll?.();
            }}
            className="text-sm hover:underline"
            style={{ color: 'var(--grid-accent, #0A21C0)' }}
            disabled={hiddenCount === 0}
          >
            Show all ({visibleCount + hiddenCount})
          </button>
          <button
            type="button"
            onClick={() => {
              onHideAll?.();
            }}
            className="text-sm hover:underline"
            style={{ color: 'var(--grid-n500, #6B6E78)' }}
            disabled={visibleCount === 0}
          >
            Hide all
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
