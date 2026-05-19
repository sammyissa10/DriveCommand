'use client';

/**
 * GridShell - Main visual frame for DataGrid.
 *
 * Provides CSS Grid layout with frozen pane support, toolbar, header, body, footer,
 * and bulk actions slots. Handles keyboard navigation at container level.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useDataGridContext } from '../core/DataGrid';
import type { DensityMode } from '../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridShellProps {
  children: React.ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Density to row height mapping
// ---------------------------------------------------------------------------

export function getDensityRowHeight(density: DensityMode): number {
  switch (density) {
    case 'compact':
      return 28;
    case 'comfortable':
      return 44;
    case 'normal':
    default:
      return 36;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridShell({ children, className }: GridShellProps) {
  const { table, density, selection, gridId } = useDataGridContext();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [focusedCell, setFocusedCell] = React.useState<{ rowIndex: number; colIndex: number } | null>(null);

  const rowCount = table.getRowModel().rows.length;
  const colCount = table.getVisibleLeafColumns().length;
  const hasSelection = selection.selectedCount > 0;

  // Keyboard navigation handler
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const rows = table.getRowModel().rows;
      const cols = table.getVisibleLeafColumns();

      if (!focusedCell) {
        // Initialize focus to first cell on any arrow key
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          setFocusedCell({ rowIndex: 0, colIndex: 0 });
          event.preventDefault();
          return;
        }
      }

      const { rowIndex, colIndex } = focusedCell ?? { rowIndex: 0, colIndex: 0 };
      let newRow = rowIndex;
      let newCol = colIndex;

      switch (event.key) {
        case 'ArrowUp':
          newRow = Math.max(0, rowIndex - 1);
          event.preventDefault();
          break;
        case 'ArrowDown':
          newRow = Math.min(rows.length - 1, rowIndex + 1);
          event.preventDefault();
          break;
        case 'ArrowLeft':
          newCol = Math.max(0, colIndex - 1);
          event.preventDefault();
          break;
        case 'ArrowRight':
          newCol = Math.min(cols.length - 1, colIndex + 1);
          event.preventDefault();
          break;
        case 'Home':
          if (event.ctrlKey || event.metaKey) {
            newRow = 0;
            newCol = 0;
          } else {
            newCol = 0;
          }
          event.preventDefault();
          break;
        case 'End':
          if (event.ctrlKey || event.metaKey) {
            newRow = rows.length - 1;
            newCol = cols.length - 1;
          } else {
            newCol = cols.length - 1;
          }
          event.preventDefault();
          break;
        case 'PageUp':
          newRow = Math.max(0, rowIndex - 10);
          event.preventDefault();
          break;
        case 'PageDown':
          newRow = Math.min(rows.length - 1, rowIndex + 10);
          event.preventDefault();
          break;
        case ' ':
          // Space: toggle row selection
          if (rows[rowIndex]) {
            selection.selectRow(rows[rowIndex].id, event);
          }
          event.preventDefault();
          break;
        case 'Enter':
          // Enter: could trigger edit mode or row action (handled by individual cells)
          break;
        case 'Escape':
          selection.clearSelection();
          setFocusedCell(null);
          event.preventDefault();
          break;
        case 'a':
          // Cmd/Ctrl+A: select all
          if (event.metaKey || event.ctrlKey) {
            selection.selectAll();
            event.preventDefault();
          }
          break;
        default:
          return;
      }

      // Handle shift+arrow for range selection
      if (event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && rows[newRow]) {
        selection.selectRow(rows[newRow].id, event);
      }

      if (newRow !== rowIndex || newCol !== colIndex) {
        setFocusedCell({ rowIndex: newRow, colIndex: newCol });
      }
    },
    [focusedCell, table, selection]
  );

  // Get focused cell ID for aria-activedescendant
  const focusedCellId = focusedCell
    ? `${gridId}-row-${focusedCell.rowIndex}-col-${focusedCell.colIndex}`
    : undefined;

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-rowcount={rowCount}
      aria-colcount={colCount}
      aria-activedescendant={focusedCellId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-density={density}
      className={cn(
        'relative flex flex-col w-full overflow-hidden rounded-lg border border-border bg-background',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className
      )}
    >
      {/* Pass focusedCell and density via context or props to children */}
      <GridShellContext.Provider
        value={{
          focusedCell,
          setFocusedCell,
          density,
          gridId,
          containerRef,
        }}
      >
        {children}
      </GridShellContext.Provider>

      {/* Bulk actions bar space (rendered by BulkActionsBar if selection) */}
      {hasSelection && <div className="h-14" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal Context for shell components
// ---------------------------------------------------------------------------

interface GridShellContextValue {
  focusedCell: { rowIndex: number; colIndex: number } | null;
  setFocusedCell: (cell: { rowIndex: number; colIndex: number } | null) => void;
  density: DensityMode;
  gridId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const GridShellContext = React.createContext<GridShellContextValue | null>(null);

export function useGridShellContext(): GridShellContextValue {
  const context = React.useContext(GridShellContext);
  if (!context) {
    throw new Error('useGridShellContext must be used within a GridShell component');
  }
  return context;
}
