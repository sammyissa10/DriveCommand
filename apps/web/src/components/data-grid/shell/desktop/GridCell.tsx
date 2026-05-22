/**
 * GridCell Component (Desktop) — DriveCommand Brand
 *
 * Individual cell renderer for desktop table rows.
 * Applies proper font treatment based on column data type:
 * - JetBrains Mono: IDs, numbers, miles, rates, dates, ETAs, codes
 * - Inter: Names, descriptions, regular text
 *
 * CRITICAL: Do NOT set inline width/minWidth here!
 * CSS Grid in GridRow controls column widths via templateColumns.
 * Cell uses overflow:hidden + min-w-0 to shrink with its grid cell.
 */

'use client';

import { flexRender, type Cell } from '@tanstack/react-table';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface GridCellProps<TData, TValue> {
  cell: Cell<TData, TValue>;
  className?: string;
}

/**
 * Check if a column should use the data font (JetBrains Mono).
 * Data font is for: IDs, numbers, miles, rates, dates, ETAs, codes, etc.
 */
function shouldUseDataFont(columnId: string, meta: Record<string, unknown> | undefined): boolean {
  // Explicit dataType in meta takes precedence
  if (meta?.dataType) {
    const dataTypes = ['number', 'date', 'currency', 'id', 'code', 'time', 'distance', 'weight'];
    return dataTypes.includes(meta.dataType as string);
  }

  // Infer from column ID patterns
  const dataPatterns = [
    /id$/i,           // *Id, *ID
    /number$/i,       // *Number
    /code$/i,         // *Code
    /date$/i,         // *Date
    /time$/i,         // *Time
    /at$/i,           // createdAt, updatedAt
    /rate$/i,         // *Rate
    /amount$/i,       // *Amount
    /total$/i,        // *Total
    /cost$/i,         // *Cost
    /price$/i,        // *Price
    /miles$/i,        // *Miles
    /weight$/i,       // *Weight
    /distance$/i,     // *Distance
    /^eta$/i,         // ETA
    /^bol$/i,         // BOL
    /^pro$/i,         // PRO number
    /^po$/i,          // PO number
    /quantity$/i,     // *Quantity
    /count$/i,        // *Count
    /sequence$/i,     // *Sequence
    /invoice/i,       // *Invoice*
    /phone$/i,        // *Phone
    /zip$/i,          // *Zip
    /tracking/i,      // *Tracking*
  ];

  return dataPatterns.some((pattern) => pattern.test(columnId));
}

/**
 * GridCell renders individual cell content in desktop table view.
 *
 * Design (DriveCommand Brand):
 * - Padding: px-4 py-3 (--grid-cell-padding-*)
 * - Typography:
 *   - Data values (IDs, numbers, dates, codes): JetBrains Mono, text-sm, tabular-nums, Ink
 *   - Regular text (names, descriptions): Inter, text-sm, Ink
 *   - Primary identifier: Inter, font-medium
 * - Truncation: overflow-hidden with text-overflow:ellipsis
 * - Tooltip: Shows full content on hover when truncated
 * - NO inline width/minWidth (CSS Grid controls sizing via GridRow)
 * - Supports custom cell renderers via TanStack Table
 *
 * @example
 * <GridCell cell={cell} />
 */
export function GridCell<TData, TValue>({
  cell,
  className,
}: GridCellProps<TData, TValue>) {
  const meta = cell.column.columnDef.meta as Record<string, unknown> | undefined;
  const useDataFont = shouldUseDataFont(cell.column.id, meta);
  const isPrimary = meta?.primary === true;

  // Track if content is truncated for tooltip display
  const contentRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Check if content is truncated on mount and resize
  useEffect(() => {
    const checkTruncation = () => {
      if (contentRef.current) {
        setIsTruncated(contentRef.current.scrollWidth > contentRef.current.clientWidth);
      }
    };
    checkTruncation();

    // Re-check on window resize (column resizes trigger reflow)
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, []);

  // Get the raw text value for tooltip
  const cellValue = cell.getValue();
  const tooltipText = cellValue != null ? String(cellValue) : '';

  return (
    <div
      className={cn(
        // CRITICAL: min-w-0 allows flex child to shrink below content size
        // overflow-hidden ensures content doesn't overflow grid cell
        'flex items-center text-sm min-w-0 overflow-hidden',
        // Color: Ink
        'text-[var(--grid-ink,#141619)]',
        // Padding
        'px-4 py-3',
        // Font weight for primary identifier
        isPrimary && 'font-medium',
        className
      )}
      style={{
        // Font family based on column type
        fontFamily: useDataFont
          ? "var(--grid-font-data, 'JetBrains Mono', monospace)"
          : "var(--grid-font-ui, 'Inter', sans-serif)",
        // Tabular nums for data columns
        fontVariantNumeric: useDataFont ? 'tabular-nums' : undefined,
      }}
      role="cell"
      // Show tooltip with full content when truncated
      title={isTruncated ? tooltipText : undefined}
      // For auto-fit column width measurement
      data-column-id={cell.column.id}
    >
      <span
        ref={contentRef}
        className="truncate"
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </span>
    </div>
  );
}
