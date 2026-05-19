'use client';

/**
 * GridCell - Cell renderer for DataGrid.
 *
 * Renders cell content with support for inline editing.
 * Uses flexRender for default rendering and supports edit mode.
 */

import * as React from 'react';
import { flexRender, type Cell } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useGridShellContext } from './GridShell';
import { useDataGridContext } from '../core/DataGrid';
import { InlineEditCell } from '../inline-edit';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridCellProps<TData, TValue> {
  /** TanStack Table cell object */
  cell: Cell<TData, TValue>;
  /** Column index for ARIA */
  colIndex: number;
  /** Whether this cell has keyboard focus */
  isFocused?: boolean;
  /** Grid ID for generating cell IDs */
  gridId: string;
  /** Row index for generating cell IDs */
  rowIndex: number;
  /** Custom content override */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Density padding map
// ---------------------------------------------------------------------------

const densityPadding = {
  compact: 'px-2 py-1',
  normal: 'px-3 py-2',
  comfortable: 'px-4 py-3',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridCell<TData, TValue>({
  cell,
  colIndex,
  isFocused = false,
  gridId,
  rowIndex,
  children,
}: GridCellProps<TData, TValue>) {
  const { density, setFocusedCell } = useGridShellContext();
  const { onCellEdit, refresh } = useDataGridContext();
  const cellRef = React.useRef<HTMLDivElement>(null);

  const column = cell.column;
  const columnMeta = column.columnDef.meta as {
    editable?: boolean;
    editType?: 'text' | 'select' | 'date';
    filterOptions?: Array<{ value: string; label: string }>;
  } | undefined;
  const isEditable = columnMeta?.editable ?? false;
  const editType = columnMeta?.editType ?? 'text';
  const selectOptions = columnMeta?.filterOptions ?? [];
  const width = column.getSize();
  const rowId = cell.row.id;
  const columnId = column.id;
  const value = cell.getValue();

  // Cell ID for ARIA
  const cellId = `${gridId}-row-${rowIndex}-col-${colIndex}`;

  // Handle cell click
  const handleCellClick = React.useCallback(() => {
    setFocusedCell({ rowIndex, colIndex });
  }, [setFocusedCell, rowIndex, colIndex]);

  // Focus cell when it becomes focused
  React.useEffect(() => {
    if (isFocused && cellRef.current) {
      cellRef.current.focus();
    }
  }, [isFocused]);

  // Handle cell edit with refresh
  const handleCellEdit = React.useCallback(
    async (rowId: string, columnId: string, newValue: unknown, oldValue: unknown) => {
      if (!onCellEdit) return;
      await onCellEdit(rowId, columnId, newValue, oldValue);
      // Optionally refresh data after edit
      if (refresh) {
        refresh();
      }
    },
    [onCellEdit, refresh]
  );

  return (
    <div
      ref={cellRef}
      id={cellId}
      role="gridcell"
      aria-colindex={colIndex + 1}
      tabIndex={isFocused ? 0 : -1}
      data-focused={isFocused ? 'true' : undefined}
      onClick={handleCellClick}
      style={{
        width,
        minWidth: 80,
      }}
      className={cn(
        'flex items-center border-r border-border',
        densityPadding[density],
        isFocused && 'ring-2 ring-primary/50 ring-inset',
        !isEditable && 'truncate'
      )}
    >
      {isEditable ? (
        <InlineEditCell
          row={cell.row.original}
          rowId={rowId}
          columnId={columnId}
          value={value}
          onCellEdit={handleCellEdit}
          editType={editType}
          selectOptions={selectOptions}
          className="w-full"
        />
      ) : (
        <span className="truncate">
          {children ?? flexRender(column.columnDef.cell, cell.getContext())}
        </span>
      )}
    </div>
  );
}
