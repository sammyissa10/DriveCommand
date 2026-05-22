/**
 * useColumnSizing Hook + Context
 *
 * Provides shared CSS Grid template columns for perfect header-body alignment.
 * Column order: Checkbox (44px if enabled), Actions (120px), then data columns.
 * Both checkbox and actions columns are frozen left (sticky).
 * Includes resize functionality with drag handles and persistence.
 */

'use client';

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import type { Table } from '@tanstack/react-table';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 600;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnSizingContextValue {
  /** CSS grid-template-columns string shared by header and body rows */
  templateColumns: string;
  /** Individual column widths map */
  columnWidths: Record<string, number>;
  /** Start resize drag on a column */
  handleResizeStart?: (columnId: string, event: React.MouseEvent) => void;
  /** Update column width programmatically */
  setColumnWidth?: (columnId: string, width: number) => void;
  /** Auto-fit column to content width on double-click */
  handleAutoFit?: (columnId: string) => void;
  /** Currently resizing column info (for width indicator) */
  resizingInfo: { columnId: string; width: number } | null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ColumnSizingContext = createContext<ColumnSizingContextValue | null>(null);

/**
 * Hook to access column sizing context.
 * Must be used within ColumnSizingProvider.
 */
export function useColumnSizing(): ColumnSizingContextValue {
  const context = useContext(ColumnSizingContext);
  if (!context) {
    throw new Error('useColumnSizing must be used within ColumnSizingProvider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ColumnSizingProviderProps<TData> {
  /** TanStack Table instance */
  table: Table<TData>;
  /** Whether row selection is enabled */
  enableSelection?: boolean;
  /** Callback when column widths change (for persistence) */
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  /** Children components (GridHeader + GridBody) */
  children: React.ReactNode;
}

/**
 * ColumnSizingProvider computes and provides shared grid template columns.
 *
 * Column order (left to right):
 * 1. Checkbox column (44px fixed) - if enableSelection, frozen left
 * 2. Actions column (120px fixed) - frozen left
 * 3. Data columns (from TanStack table, use getSize() or default 150px)
 *
 * This ensures header and body rows are pixel-aligned via identical grid-template-columns.
 *
 * @example
 * <ColumnSizingProvider table={table} enableSelection>
 *   <GridHeader />
 *   <GridBody />
 * </ColumnSizingProvider>
 */
export function ColumnSizingProvider<TData>({
  table,
  enableSelection = false,
  onColumnWidthsChange,
  children,
}: ColumnSizingProviderProps<TData>) {
  // Track custom column widths (overrides from drag resize)
  const [customWidths, setCustomWidths] = useState<Record<string, number>>({});

  // Resize state
  const [resizing, setResizing] = useState<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Handle resize drag start
  const handleResizeStart = useCallback(
    (columnId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const columns = table.getAllColumns();
      const column = columns.find((c) => c.id === columnId);
      if (!column) return;

      const meta = column.columnDef.meta as { defaultWidth?: number } | undefined;
      const currentWidth = customWidths[columnId] ?? column.getSize() ?? meta?.defaultWidth ?? 150;

      setResizing({
        columnId,
        startX: event.clientX,
        startWidth: currentWidth,
      });
    },
    [table, customWidths]
  );

  // Handle mouse move during resize
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizing.startX;
      const newWidth = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, resizing.startWidth + deltaX)
      );

      setCustomWidths((prev) => ({
        ...prev,
        [resizing.columnId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizing) {
        // Notify parent of width changes for persistence
        const newWidths = { ...customWidths };
        onColumnWidthsChange?.(newWidths);
      }
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Add cursor style to body during resize
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, customWidths, onColumnWidthsChange]);

  // Set column width programmatically
  const setColumnWidth = useCallback((columnId: string, width: number) => {
    const clampedWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width));
    setCustomWidths((prev) => ({
      ...prev,
      [columnId]: clampedWidth,
    }));
  }, []);

  // Auto-fit column to content width on double-click
  // Measures the widest cell content + padding and sets column to that width
  const handleAutoFit = useCallback(
    (columnId: string) => {
      // Find all cells in this column and measure their content width
      const cells = document.querySelectorAll(`[data-column-id="${columnId}"]`);
      let maxWidth = MIN_COLUMN_WIDTH;

      cells.forEach((cell) => {
        // Get the text content span inside the cell
        const textSpan = cell.querySelector('span');
        if (textSpan) {
          // scrollWidth gives the full content width without truncation
          // Add padding (16px * 2 = 32px)
          const contentWidth = textSpan.scrollWidth + 32;
          maxWidth = Math.max(maxWidth, contentWidth);
        }
      });

      // Also check header width
      const header = document.querySelector(`[data-header-id="${columnId}"]`);
      if (header) {
        const headerWidth = header.scrollWidth + 32;
        maxWidth = Math.max(maxWidth, headerWidth);
      }

      // Clamp to min/max
      const clampedWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, maxWidth));

      setCustomWidths((prev) => ({
        ...prev,
        [columnId]: clampedWidth,
      }));

      // Notify parent for persistence
      onColumnWidthsChange?.({ ...customWidths, [columnId]: clampedWidth });
    },
    [customWidths, onColumnWidthsChange]
  );

  // Resizing info for width indicator display
  const resizingInfo = useMemo(() => {
    if (!resizing) return null;
    return {
      columnId: resizing.columnId,
      width: customWidths[resizing.columnId] ?? resizing.startWidth,
    };
  }, [resizing, customWidths]);

  const value = useMemo(() => {
    const widths: string[] = [];
    const widthsMap: Record<string, number> = {};

    // 1. Checkbox column (FIRST, if selection enabled) - frozen left
    if (enableSelection) {
      const checkboxWidth = 44;
      widths.push(`${checkboxWidth}px`);
      widthsMap['select'] = checkboxWidth;
    }

    // 2. Actions column (SECOND, always present) - frozen left
    const actionsWidth = 120;
    widths.push(`${actionsWidth}px`);
    widthsMap['actions'] = actionsWidth;

    // 3. Data columns from TanStack Table
    // IMPORTANT: Use getVisibleLeafColumns() instead of getAllColumns() to:
    // - Respect column order set by setColumnOrder() (fixes resize-after-reorder bug)
    // - Match the order used by GridHeader's getHeaderGroups()
    // - Exclude hidden columns (matching what's actually rendered)
    const columns = table.getVisibleLeafColumns();
    for (const column of columns) {
      // Skip internal columns (checkbox and actions are handled above)
      if (column.id === 'select' || column.id === 'actions') continue;

      // Get size: custom width > TanStack size > meta default > fallback 150px
      const meta = column.columnDef.meta as { defaultWidth?: number } | undefined;
      const size = customWidths[column.id] ?? column.getSize() ?? meta?.defaultWidth ?? 150;
      widths.push(`${size}px`);
      widthsMap[column.id] = size;
    }

    // Build CSS grid-template-columns string
    const templateColumns = widths.join(' ');

    return {
      templateColumns,
      columnWidths: widthsMap,
      handleResizeStart,
      setColumnWidth,
      handleAutoFit,
      resizingInfo,
    };
  }, [table, enableSelection, customWidths, handleResizeStart, setColumnWidth, handleAutoFit, resizingInfo]);

  return <ColumnSizingContext.Provider value={value}>{children}</ColumnSizingContext.Provider>;
}
