/**
 * GridRow Component (Desktop) — DriveCommand Brand
 *
 * Desktop table row with 52px fixed height, selection, hover states, and QuickActions slot.
 * Uses CSS Grid layout matching GridHeader for perfect column alignment.
 * Paper white surface, Signal Blue selection bar.
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
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

/**
 * GridRow renders a full table row with cells, selection, and interaction states.
 *
 * Design (DriveCommand Brand):
 * - Layout: CSS Grid with shared templateColumns from useColumnSizing
 * - Height: 52px fixed (--grid-row-height)
 * - Background: Paper white (#FFFFFF) at rest
 * - Hover: accent at 3%
 * - Selected: accent at 5% + 2px Signal Blue left bar
 * - Row separators: 1px N100 at 50%, body rows only
 * - Column dividers: 1px N100 at 40%
 * - Focus: ring-2 Signal Blue ring-inset
 * - Column order: Checkbox (first if enabled) → Actions (second) → Data columns
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
  isLast,
}: GridRowProps<TData>) {
  const { templateColumns } = useColumnSizing();
  const { getVisibleCells } = row;

  // Get data cells (exclude select/actions)
  const dataCells = getVisibleCells().filter(
    (cell) => cell.column.id !== 'select' && cell.column.id !== 'actions'
  );

  return (
    <div
      className={cn(
        'group grid items-center transition-colors duration-150',
        // Background: Paper white at rest
        'bg-[var(--grid-paper,#FFFFFF)]',
        // Border: row separator (not on last row)
        !isLast && 'border-b',
        // Hover: accent at 3%
        'hover:bg-[var(--grid-hover)]',
        // Selected: accent at 5% + 2px left bar
        isSelected && 'bg-[var(--grid-selected)] border-l-2 border-l-[var(--grid-accent,#0A21C0)]',
        // Focus ring
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--grid-accent,#0A21C0)] focus-visible:ring-inset',
        className
      )}
      style={{
        height: 'var(--grid-row-height, 52px)',
        gridTemplateColumns: templateColumns,
        borderColor: isSelected ? undefined : 'var(--grid-border-row)',
        fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
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
      {/* Checkbox column cell (FIRST if enabled) */}
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

      {/* Actions column cell (SECOND) */}
      <div className="flex items-center justify-center px-2">
        {quickActions}
      </div>

      {/* Data cells with dividers */}
      {dataCells.map((cell, index) => {
        const isLastCell = index === dataCells.length - 1;
        return (
          <div
            key={cell.id}
            // CRITICAL: min-w-0 + overflow-hidden ensures cell shrinks with Grid column
            // Without this, flex items have implicit min-width:auto which prevents shrinking
            className="relative h-full flex items-center min-w-0 overflow-hidden"
          >
            <GridCell cell={cell} />
            {/* Column divider (not after last column) */}
            {!isLastCell && (
              <div
                className="absolute right-0 top-0 h-full w-[1px]"
                style={{ backgroundColor: 'var(--grid-border-divider)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
