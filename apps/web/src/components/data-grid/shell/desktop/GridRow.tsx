/**
 * GridRow Component (Desktop)
 *
 * Desktop table row with 48px fixed height, selection, hover states, and QuickActions slot.
 * Uses CSS Grid layout matching GridHeader for perfect column alignment.
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { GridCell } from './GridCell';
import { useColumnSizing } from '../../hooks/useColumnSizing';

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
 * - Layout: CSS Grid with shared templateColumns from useColumnSizing
 * - Height: 48px fixed (--grid-row-height)
 * - Border: border-b border-border/40 (last row no border)
 * - Hover: bg-muted/50 (very subtle)
 * - Selected: bg-b-050 (--grid-accent-subtle) + left border accent
 * - Focus: ring-2 ring-primary ring-inset
 * - QuickActions: rendered in FIRST cell (actions column), ALWAYS visible (not hover)
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
  const { templateColumns } = useColumnSizing();
  const { getVisibleCells } = row;

  return (
    <div
      className={cn(
        'group grid items-center border-b border-border/40 transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-b-050 border-l-2 border-l-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        className
      )}
      style={{
        height: 'var(--grid-row-height, 48px)',
        gridTemplateColumns: templateColumns,
      }}
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
      {/* Actions column cell (FIRST) */}
      <div className="flex items-center justify-center px-2">
        {quickActions}
      </div>

      {/* Checkbox column cell (SECOND if enabled) */}
      {enableSelection && (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select row ${rowIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Data cells */}
      {getVisibleCells().map((cell) => {
        // Skip internal columns (already rendered above)
        if (cell.column.id === 'select' || cell.column.id === 'actions') return null;

        return <GridCell key={cell.id} cell={cell} />;
      })}
    </div>
  );
}
