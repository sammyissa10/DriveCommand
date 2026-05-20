/**
 * useColumnSizing Hook + Context
 *
 * Provides shared CSS Grid template columns for perfect header-body alignment.
 * Actions column is FIRST (132px), checkbox second (44px if enabled), then data columns.
 */

'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Table } from '@tanstack/react-table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnSizingContextValue {
  /** CSS grid-template-columns string shared by header and body rows */
  templateColumns: string;
  /** Individual column widths map */
  columnWidths: Record<string, number>;
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
  /** Children components (GridHeader + GridBody) */
  children: React.ReactNode;
}

/**
 * ColumnSizingProvider computes and provides shared grid template columns.
 *
 * Column order:
 * 1. Actions column (132px fixed) - ALWAYS FIRST
 * 2. Checkbox column (44px fixed) - if enableSelection
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
  children,
}: ColumnSizingProviderProps<TData>) {
  const value = useMemo(() => {
    const widths: string[] = [];
    const widthsMap: Record<string, number> = {};

    // 1. Actions column (FIRST, always present)
    const actionsWidth = 132;
    widths.push(`${actionsWidth}px`);
    widthsMap['actions'] = actionsWidth;

    // 2. Checkbox column (SECOND, if selection enabled)
    if (enableSelection) {
      const checkboxWidth = 44;
      widths.push(`${checkboxWidth}px`);
      widthsMap['select'] = checkboxWidth;
    }

    // 3. Data columns from TanStack Table
    const columns = table.getAllColumns();
    for (const column of columns) {
      // Skip internal columns
      if (column.id === 'select' || column.id === 'actions') continue;

      // Get size from TanStack column or meta default or fallback 150px
      const size = column.getSize() || column.columnDef.meta?.defaultWidth || 150;
      widths.push(`${size}px`);
      widthsMap[column.id] = size;
    }

    // Build CSS grid-template-columns string
    const templateColumns = widths.join(' ');

    return {
      templateColumns,
      columnWidths: widthsMap,
    };
  }, [table, enableSelection]);

  return <ColumnSizingContext.Provider value={value}>{children}</ColumnSizingContext.Provider>;
}
