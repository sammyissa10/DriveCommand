/**
 * GridCell Component (Desktop)
 *
 * Individual cell renderer for desktop table rows.
 * NO vertical borders, text truncation with ellipsis.
 */

'use client';

import { flexRender, type Cell } from '@tanstack/react-table';
import { cn } from '@/lib/utils';

export interface GridCellProps<TData, TValue> {
  cell: Cell<TData, TValue>;
  className?: string;
}

/**
 * GridCell renders individual cell content in desktop table view.
 *
 * Design:
 * - Padding: px-4 py-3 (--grid-cell-padding-*)
 * - Typography: text-sm text-foreground
 * - Truncation: truncate with ellipsis for overflow
 * - NO vertical borders
 * - Supports custom cell renderers via TanStack Table
 *
 * @example
 * <GridCell cell={cell} />
 */
export function GridCell<TData, TValue>({
  cell,
  className,
}: GridCellProps<TData, TValue>) {
  return (
    <div
      className={cn(
        'flex items-center text-sm text-foreground',
        'px-4 py-3',
        'truncate',
        className
      )}
      style={{
        width: cell.column.getSize(),
        minWidth: cell.column.getSize(),
      }}
      role="cell"
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  );
}
