/**
 * GridRow Component (Desktop)
 *
 * Desktop table row with 48px fixed height, selection, hover states, and QuickActions slot.
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { GridCell } from './GridCell';

export interface GridRowProps<TData> {
  row: Row<TData>;
  rowIndex: number;
  isSelected?: boolean;
  enableSelection?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
  quickActions?: React.ReactNode;
  className?: string;
}

/**
 * GridRow renders a full table row with cells, selection, and interaction states.
 *
 * Design:
 * - Height: 48px fixed (--grid-row-height)
 * - Border: border-b border-border/40 (last row no border)
 * - Hover: bg-muted/50 (very subtle)
 * - Selected: bg-b-050 (--grid-accent-subtle) + left border accent
 * - Focus: ring-2 ring-primary ring-inset
 * - QuickActions: rendered in last cell, opacity-0 group-hover:opacity-100
 *
 * @example
 * <GridRow
 *   row={row}
 *   rowIndex={0}
 *   isSelected={isSelected}
 *   onSelect={() => {}}
 *   onDoubleClick={() => {}}
 *   quickActions={<QuickActions />}
 * />
 */
export function GridRow<TData>({
  row,
  rowIndex,
  isSelected,
  enableSelection,
  onSelect,
  onDoubleClick,
  quickActions,
  className,
}: GridRowProps<TData>) {
  const { getVisibleCells } = row;

  return (
    <div
      className={cn(
        'group flex items-center border-b border-border/40 transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-b-050 border-l-2 border-l-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        className
      )}
      style={{ height: 'var(--grid-row-height, 48px)' }}
      role="row"
      aria-rowindex={rowIndex + 2} // +2 because header is row 1
      aria-selected={isSelected}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onDoubleClick) {
          onDoubleClick();
        } else if (e.key === ' ' && onSelect) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Selection checkbox */}
      {enableSelection && (
        <div className="flex w-12 items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select row ${rowIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Cells */}
      {getVisibleCells().map((cell, cellIndex) => {
        const isCheckboxColumn = cell.column.id === 'select';
        if (isCheckboxColumn) return null;

        const isLastCell = cellIndex === getVisibleCells().length - 1;

        return (
          <div key={cell.id} className="relative flex items-center">
            <GridCell cell={cell} />

            {/* QuickActions in last cell */}
            {isLastCell && quickActions && (
              <div className="absolute right-4 opacity-0 transition-opacity motion-safe:duration-150 group-hover:opacity-100">
                {quickActions}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
