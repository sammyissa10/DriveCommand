'use client';

/**
 * Headless DataGrid component.
 *
 * Provides a context with table state and imperative ref API.
 * Consumers compose their own UI using the context or render props.
 */

import {
  forwardRef,
  useImperativeHandle,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import type { Table } from '@tanstack/react-table';
import type {
  DataGridProps,
  DataGridRef,
  DataGridContextValue,
  DensityMode,
  GridPreferences,
} from './types';
import { useDataGrid } from './useDataGrid';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DataGridContext = createContext<DataGridContextValue<unknown> | null>(null);

/**
 * Hook to access DataGrid context from child components.
 */
export function useDataGridContext<TData>(): DataGridContextValue<TData> {
  const context = useContext(DataGridContext);
  if (!context) {
    throw new Error('useDataGridContext must be used within a DataGrid component');
  }
  return context as DataGridContextValue<TData>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Headless DataGrid component.
 *
 * @example
 * // Render prop pattern
 * <DataGrid
 *   gridId="users"
 *   columns={columns}
 *   data={users}
 *   renderHeader={(table) => <MyHeader table={table} />}
 *   renderRow={(row) => <MyRow row={row} />}
 * />
 *
 * @example
 * // Context pattern
 * <DataGrid gridId="users" columns={columns} data={users}>
 *   <MyTableUI />
 * </DataGrid>
 */
function DataGridInner<TData>(
  props: DataGridProps<TData>,
  ref: React.ForwardedRef<DataGridRef>
) {
  const {
    gridId,
    className,
    renderHeader,
    renderRow,
    renderEmpty,
    renderLoading,
    children,
    onCellEdit,
  } = props;

  const {
    table,
    isLoading,
    preferences,
    selection,
    refresh,
    resetPreferences,
    clearSelection,
    exportCsv,
  } = useDataGrid(props);

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      refresh,
      resetPreferences,
      clearSelection,
      exportCsv,
    }),
    [refresh, resetPreferences, clearSelection, exportCsv]
  );

  // Build context value
  const contextValue: DataGridContextValue<TData> = {
    table: table as Table<TData>,
    isLoading,
    preferences: preferences.preferences as GridPreferences,
    selection: {
      selectedIds: selection.selectedIds,
      selectRow: selection.selectRow,
      selectAll: () => {
        const allIds = table.getRowModel().rows.map((row) => row.id);
        selection.selectAll(allIds);
      },
      clearSelection: selection.clearSelection,
      isSelected: selection.isSelected,
      selectedCount: selection.selectedCount,
    },
    density: preferences.preferences.density as DensityMode,
    gridId,
    onCellEdit: onCellEdit,
    refresh,
  };

  // Determine what to render
  const rows = table.getRowModel().rows;
  const hasData = rows.length > 0;

  // Render based on state
  let content: ReactNode = null;

  if (isLoading && renderLoading) {
    content = renderLoading();
  } else if (!hasData && renderEmpty) {
    content = renderEmpty();
  } else {
    // Render with render props if provided
    if (renderHeader || renderRow) {
      content = (
        <>
          {renderHeader?.(table)}
          {rows.map((row, index) => renderRow?.(row, index))}
        </>
      );
    }

    // Also render children for compound component pattern
    if (children) {
      content = (
        <>
          {content}
          {children}
        </>
      );
    }
  }

  return (
    <DataGridContext.Provider value={contextValue as DataGridContextValue<unknown>}>
      {className ? <div className={className}>{content}</div> : content}
    </DataGridContext.Provider>
  );
}

// Export with forwardRef, preserving generic type
export const DataGrid = forwardRef(DataGridInner) as <TData>(
  props: DataGridProps<TData> & { ref?: React.ForwardedRef<DataGridRef> }
) => ReturnType<typeof DataGridInner>;

// Also export the inner component for type inference
export type { DataGridProps, DataGridRef };
