'use client';

/**
 * useGridKeyboardNav - Keyboard navigation hook for DataGrid.
 *
 * Provides full keyboard navigation including arrow keys, Home/End,
 * PageUp/PageDown, Enter/Space for selection, and Cmd+A for select all.
 */

import * as React from 'react';
import type { Table } from '@tanstack/react-table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FocusedCell {
  rowIndex: number;
  colIndex: number;
}

interface UseGridKeyboardNavOptions<TData> {
  /** TanStack Table instance */
  table: Table<TData>;
  /** Selection functions */
  selection: {
    selectRow: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
    selectAll: () => void;
    clearSelection: () => void;
  };
  /** Ref to grid container */
  gridRef: React.RefObject<HTMLDivElement | null>;
  /** Grid ID for generating cell IDs */
  gridId: string;
  /** Callback when cell edit starts */
  onCellEdit?: (rowIndex: number, colIndex: number) => void;
  /** Callback when row is activated (Enter on row) */
  onRowActivate?: (rowIndex: number) => void;
}

interface UseGridKeyboardNavReturn {
  /** Currently focused cell */
  focusedCell: FocusedCell | null;
  /** Set focused cell */
  setFocusedCell: (cell: FocusedCell | null) => void;
  /** Keyboard event handler */
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Get cell ID for ARIA */
  getCellId: (rowIndex: number, colIndex: number) => string;
  /** Focus a specific cell */
  focusCell: (rowIndex: number, colIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridKeyboardNav<TData>({
  table,
  selection,
  gridRef,
  gridId,
  onCellEdit,
  onRowActivate,
}: UseGridKeyboardNavOptions<TData>): UseGridKeyboardNavReturn {
  const [focusedCell, setFocusedCell] = React.useState<FocusedCell | null>(null);

  // Get row and column counts
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const rowCount = rows.length;
  const colCount = columns.length;

  // Generate cell ID
  const getCellId = React.useCallback(
    (rowIndex: number, colIndex: number) => {
      return `${gridId}-row-${rowIndex}-col-${colIndex}`;
    },
    [gridId]
  );

  // Focus a specific cell
  const focusCell = React.useCallback(
    (rowIndex: number, colIndex: number) => {
      setFocusedCell({ rowIndex, colIndex });

      // Focus the actual DOM element
      const cellId = getCellId(rowIndex, colIndex);
      const cellElement = document.getElementById(cellId);
      if (cellElement) {
        cellElement.focus();
      }
    },
    [getCellId]
  );

  // Handle keyboard events
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const { key, shiftKey, metaKey, ctrlKey } = event;

      // Initialize focus if not set
      if (!focusedCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        setFocusedCell({ rowIndex: 0, colIndex: 0 });
        event.preventDefault();
        return;
      }

      if (!focusedCell) return;

      const { rowIndex, colIndex } = focusedCell;
      let newRowIndex = rowIndex;
      let newColIndex = colIndex;

      switch (key) {
        // Arrow navigation
        case 'ArrowUp':
          newRowIndex = Math.max(0, rowIndex - 1);
          event.preventDefault();
          break;

        case 'ArrowDown':
          newRowIndex = Math.min(rowCount - 1, rowIndex + 1);
          event.preventDefault();
          break;

        case 'ArrowLeft':
          newColIndex = Math.max(0, colIndex - 1);
          event.preventDefault();
          break;

        case 'ArrowRight':
          newColIndex = Math.min(colCount - 1, colIndex + 1);
          event.preventDefault();
          break;

        // Home/End navigation
        case 'Home':
          if (ctrlKey || metaKey) {
            // Ctrl+Home: First cell in grid
            newRowIndex = 0;
            newColIndex = 0;
          } else {
            // Home: First cell in row
            newColIndex = 0;
          }
          event.preventDefault();
          break;

        case 'End':
          if (ctrlKey || metaKey) {
            // Ctrl+End: Last cell in grid
            newRowIndex = rowCount - 1;
            newColIndex = colCount - 1;
          } else {
            // End: Last cell in row
            newColIndex = colCount - 1;
          }
          event.preventDefault();
          break;

        // Page navigation
        case 'PageUp':
          newRowIndex = Math.max(0, rowIndex - 10);
          event.preventDefault();
          break;

        case 'PageDown':
          newRowIndex = Math.min(rowCount - 1, rowIndex + 10);
          event.preventDefault();
          break;

        // Selection
        case ' ':
          // Space: Toggle row selection
          if (rows[rowIndex]) {
            selection.selectRow(rows[rowIndex].id, event);
          }
          event.preventDefault();
          break;

        case 'Enter':
          // Enter: Activate row or start editing
          if (onCellEdit) {
            onCellEdit(rowIndex, colIndex);
          } else if (onRowActivate) {
            onRowActivate(rowIndex);
          }
          event.preventDefault();
          break;

        case 'Escape':
          // Escape: Clear selection and focus
          selection.clearSelection();
          setFocusedCell(null);
          // Return focus to grid container
          gridRef.current?.focus();
          event.preventDefault();
          break;

        case 'a':
        case 'A':
          // Cmd/Ctrl+A: Select all
          if (metaKey || ctrlKey) {
            selection.selectAll();
            event.preventDefault();
          }
          break;

        default:
          return;
      }

      // Handle shift+arrow for range selection
      if (shiftKey && ['ArrowUp', 'ArrowDown'].includes(key)) {
        if (rows[newRowIndex]) {
          selection.selectRow(rows[newRowIndex].id, event);
        }
      }

      // Update focus if changed
      if (newRowIndex !== rowIndex || newColIndex !== colIndex) {
        focusCell(newRowIndex, newColIndex);
      }
    },
    [focusedCell, rowCount, colCount, rows, selection, gridRef, onCellEdit, onRowActivate, focusCell]
  );

  // Manage data-focused attribute for styling
  React.useEffect(() => {
    if (!focusedCell) return;

    const cellId = getCellId(focusedCell.rowIndex, focusedCell.colIndex);
    const cellElement = document.getElementById(cellId);

    if (cellElement) {
      cellElement.setAttribute('data-focused', 'true');

      return () => {
        cellElement.removeAttribute('data-focused');
      };
    }
  }, [focusedCell, getCellId]);

  return {
    focusedCell,
    setFocusedCell,
    handleKeyDown,
    getCellId,
    focusCell,
  };
}
