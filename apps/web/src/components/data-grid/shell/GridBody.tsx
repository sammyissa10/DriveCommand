'use client';

/**
 * GridBody - Virtualized row container for DataGrid.
 *
 * Uses @tanstack/react-virtual to render only visible rows for performance.
 * Supports custom row renderers and passes context to GridRow components.
 */

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Row } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useDataGridContext } from '../core/DataGrid';
import { useGridShellContext, getDensityRowHeight } from './GridShell';
import { GridRow } from './GridRow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridBodyProps<TData> {
  /** Optional custom row renderer */
  renderRow?: (row: Row<TData>, index: number) => React.ReactNode;
  /** Number of rows to render outside visible area (default: 5) */
  overscan?: number;
  /** Enable row selection checkboxes */
  enableSelection?: boolean;
  /** Callback when row is clicked */
  onRowClick?: (row: TData) => void;
  /** Callback when row is double-clicked */
  onRowDoubleClick?: (row: TData) => void;
  /** Class name for the body container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridBody<TData>({
  renderRow,
  overscan = 5,
  enableSelection = false,
  onRowClick,
  onRowDoubleClick,
  className,
}: GridBodyProps<TData>) {
  const { table, isLoading } = useDataGridContext<TData>();
  const { density, focusedCell, gridId } = useGridShellContext();
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rows = table.getRowModel().rows;
  const rowHeight = getDensityRowHeight(density);

  // Virtual row rendering
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Don't render if loading or no rows
  if (isLoading) {
    return null;
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      ref={parentRef}
      className={cn('flex-1 overflow-auto', className)}
      role="rowgroup"
      aria-live="polite"
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          const isFocused = focusedCell?.rowIndex === virtualRow.index;

          // Custom row renderer
          if (renderRow) {
            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(row, virtualRow.index)}
              </div>
            );
          }

          // Default GridRow
          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <GridRow
                row={row}
                index={virtualRow.index}
                isFocused={isFocused}
                focusedColIndex={isFocused ? focusedCell?.colIndex ?? null : null}
                enableSelection={enableSelection}
                gridId={gridId}
                onRowClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onRowDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
