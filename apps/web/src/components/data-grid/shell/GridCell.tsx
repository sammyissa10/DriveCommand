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
import { Input } from '@/components/ui/input';
import { useGridShellContext } from './GridShell';

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
  const cellRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState<string>('');

  const column = cell.column;
  const columnMeta = column.columnDef.meta as { editable?: boolean } | undefined;
  const isEditable = columnMeta?.editable ?? false;
  const width = column.getSize();

  // Cell ID for ARIA
  const cellId = `${gridId}-row-${rowIndex}-col-${colIndex}`;

  // Start editing
  const startEdit = React.useCallback(() => {
    if (!isEditable) return;
    const value = cell.getValue();
    setEditValue(value != null ? String(value) : '');
    setIsEditing(true);
  }, [isEditable, cell]);

  // Commit edit
  const commitEdit = React.useCallback(() => {
    if (!isEditing) return;
    setIsEditing(false);
    // Note: In a real implementation, this would call an update function
    // to persist the change. For now, we just exit edit mode.
    console.log('Commit edit:', cell.column.id, editValue);
  }, [isEditing, editValue, cell.column.id]);

  // Cancel edit
  const cancelEdit = React.useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  // Handle keyboard in edit mode
  const handleEditKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        commitEdit();
        event.preventDefault();
      } else if (event.key === 'Escape') {
        cancelEdit();
        event.preventDefault();
      }
    },
    [commitEdit, cancelEdit]
  );

  // Handle cell keyboard
  const handleCellKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (isEditing) {
        handleEditKeyDown(event);
        return;
      }

      if (event.key === 'Enter' && isEditable) {
        startEdit();
        event.preventDefault();
      }
    },
    [isEditing, handleEditKeyDown, isEditable, startEdit]
  );

  // Handle cell click
  const handleCellClick = React.useCallback(() => {
    setFocusedCell({ rowIndex, colIndex });
  }, [setFocusedCell, rowIndex, colIndex]);

  // Handle cell double click for editing
  const handleDoubleClick = React.useCallback(() => {
    if (isEditable) {
      startEdit();
    }
  }, [isEditable, startEdit]);

  // Focus input when editing starts
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Focus cell when it becomes focused
  React.useEffect(() => {
    if (isFocused && !isEditing && cellRef.current) {
      cellRef.current.focus();
    }
  }, [isFocused, isEditing]);

  return (
    <div
      ref={cellRef}
      id={cellId}
      role="gridcell"
      aria-colindex={colIndex + 1}
      tabIndex={isFocused ? 0 : -1}
      data-focused={isFocused ? 'true' : undefined}
      onClick={handleCellClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleCellKeyDown}
      style={{
        width,
        minWidth: 80,
      }}
      className={cn(
        'flex items-center border-r border-border truncate',
        densityPadding[density],
        isFocused && 'ring-2 ring-primary/50 ring-inset',
        isEditable && 'cursor-text'
      )}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleEditKeyDown}
          className="h-6 w-full text-sm"
        />
      ) : (
        <span className="truncate">
          {children ?? flexRender(column.columnDef.cell, cell.getContext())}
        </span>
      )}
    </div>
  );
}
