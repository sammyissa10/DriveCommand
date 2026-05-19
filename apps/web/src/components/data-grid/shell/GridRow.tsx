'use client';

/**
 * GridRow - Single row component for DataGrid.
 *
 * Handles selection states, hover, click handlers, and renders cells.
 * Supports ARIA attributes for accessibility.
 */

import * as React from 'react';
import type { Row } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useDataGridContext } from '../core/DataGrid';
import { GridCell } from './GridCell';
import { Checkbox } from '@/components/ui/checkbox';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridRowProps<TData> {
  /** TanStack Table row object */
  row: Row<TData>;
  /** Row index in the data array */
  index: number;
  /** Whether this row has keyboard focus */
  isFocused?: boolean;
  /** Column index that has focus (for cell-level focus) */
  focusedColIndex?: number | null;
  /** Enable row selection checkbox */
  enableSelection?: boolean;
  /** Grid ID for generating cell IDs */
  gridId: string;
  /** Callback when row is clicked */
  onRowClick?: () => void;
  /** Callback when row is double-clicked */
  onRowDoubleClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridRow<TData>({
  row,
  index,
  isFocused = false,
  focusedColIndex,
  enableSelection = false,
  gridId,
  onRowClick,
  onRowDoubleClick,
}: GridRowProps<TData>) {
  const { selection } = useDataGridContext<TData>();
  const rowRef = React.useRef<HTMLDivElement>(null);

  const isSelected = selection.isSelected(row.id);
  const cells = row.getVisibleCells();

  // Handle row click for selection
  const handleClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (enableSelection) {
        selection.selectRow(row.id, event);
      }
      onRowClick?.();
    },
    [enableSelection, selection, row.id, onRowClick]
  );

  // Handle double-click
  const handleDoubleClick = React.useCallback(() => {
    onRowDoubleClick?.();
  }, [onRowDoubleClick]);

  // Handle keyboard selection
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (enableSelection) {
          selection.selectRow(row.id, event);
        }
        event.preventDefault();
      }
    },
    [enableSelection, selection, row.id]
  );

  // Focus row when it becomes focused
  React.useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={index + 1}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex h-full border-b border-border transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/5 border-l-[3px] border-l-primary',
        isFocused && 'ring-2 ring-primary ring-inset'
      )}
    >
      {/* Selection checkbox */}
      {enableSelection && (
        <div
          className="flex items-center justify-center w-12 px-3 border-r border-border"
          role="gridcell"
          aria-colindex={0}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => {
              // Create a synthetic event for the selectRow call
              const syntheticEvent = {
                shiftKey: false,
                metaKey: false,
                ctrlKey: false,
              } as React.MouseEvent;
              selection.selectRow(row.id, syntheticEvent);
            }}
            aria-label={`Select row ${index + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Data cells */}
      {cells.map((cell, colIndex) => (
        <GridCell
          key={cell.id}
          cell={cell}
          colIndex={enableSelection ? colIndex + 1 : colIndex}
          isFocused={isFocused && focusedColIndex === colIndex}
          gridId={gridId}
          rowIndex={index}
        />
      ))}
    </div>
  );
}
