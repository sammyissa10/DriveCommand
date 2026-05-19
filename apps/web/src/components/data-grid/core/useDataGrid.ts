'use client';

/**
 * Orchestration hook for DataGrid.
 *
 * Composes useGridPreferences, useGridUrlState, useGridSelection with TanStack Table
 * to provide a unified API for grid state management.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type SortingState,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import type {
  DataGridProps,
  ExtendedColumnDef,
  ServerFetchResult,
  UseDataGridReturn,
  SortState,
} from './types';
import { useGridPreferences } from './useGridPreferences';
import { useGridUrlState } from './useGridUrlState';
import { useGridSelection } from './useGridSelection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert TanStack Table SortingState to our SortState.
 */
function tanstackToSortState(sorting: SortingState): SortState | null {
  if (sorting.length === 0) return null;
  return {
    field: sorting[0].id,
    direction: sorting[0].desc ? 'desc' : 'asc',
  };
}

/**
 * Convert our SortState to TanStack Table SortingState.
 */
function sortStateToTanstack(sort: SortState | null): SortingState {
  if (!sort) return [];
  return [{ id: sort.field, desc: sort.direction === 'desc' }];
}

/**
 * Get row ID from data using accessor function or default 'id' property.
 */
function getRowId<TData>(row: TData, rowIdAccessor?: (row: TData) => string): string {
  if (rowIdAccessor) {
    return rowIdAccessor(row);
  }
  // Default: look for 'id' property
  if (typeof row === 'object' && row !== null && 'id' in row) {
    return String((row as { id: unknown }).id);
  }
  throw new Error('Row ID accessor not provided and row does not have an id property');
}

/**
 * Export data to CSV.
 */
function exportToCsv<TData>(
  columns: ExtendedColumnDef<TData>[],
  data: TData[],
  filename: string = 'export.csv'
): void {
  // Filter to exportable columns (default: all columns with accessorKey)
  const exportableColumns = columns.filter((col) => {
    // Skip columns explicitly marked as not exportable
    if (col.meta?.exportable === false) return false;
    // Include columns with accessorKey or accessorFn
    return 'accessorKey' in col || 'accessorFn' in col;
  });

  // Build header row
  const headers = exportableColumns.map((col) => {
    // Use header string if available, otherwise use accessorKey
    if (typeof col.header === 'string') return col.header;
    if ('accessorKey' in col) return String(col.accessorKey);
    return 'Column';
  });

  // Build data rows
  const rows = data.map((row) => {
    return exportableColumns.map((col) => {
      let value: unknown;
      if ('accessorKey' in col && typeof col.accessorKey === 'string') {
        // Access nested keys like "user.name"
        const keys = col.accessorKey.split('.');
        value = keys.reduce((obj, key) => {
          if (obj && typeof obj === 'object') {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, row as unknown);
      } else if ('accessorFn' in col && col.accessorFn) {
        value = col.accessorFn(row, 0);
      }

      // Convert value to string, handling special cases
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }
      return String(value);
    });
  });

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDataGrid<TData>(props: DataGridProps<TData>): UseDataGridReturn<TData> {
  const {
    gridId,
    columns,
    data: staticData,
    dataFetcher,
    rowIdAccessor,
    initialPageSize = 25,
    enableSelection = false,
    enableUrlSync = false,
    enablePersistence = false,
    onSelectionChange,
  } = props;

  // ---------------------------------------------------------------------------
  // Composed Hooks
  // ---------------------------------------------------------------------------

  const preferences = useGridPreferences(gridId, enablePersistence);
  const urlState = useGridUrlState(enableUrlSync);
  const selection = useGridSelection(gridId);

  // ---------------------------------------------------------------------------
  // Server-Side Data State
  // ---------------------------------------------------------------------------

  const [serverData, setServerData] = useState<TData[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(!!dataFetcher);
  const fetchIdRef = useRef(0);

  // Determine effective data source
  const isServerSide = !!dataFetcher;
  const effectiveData = isServerSide ? serverData : (staticData ?? []);

  // ---------------------------------------------------------------------------
  // Sorting State
  // ---------------------------------------------------------------------------

  // Derive sorting from URL state or local state
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const sorting = enableUrlSync
    ? sortStateToTanstack(urlState.sort)
    : localSorting;

  const onSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      if (enableUrlSync) {
        urlState.setSort(tanstackToSortState(newSorting));
      } else {
        setLocalSorting(newSorting);
      }
    },
    [sorting, enableUrlSync, urlState]
  );

  // ---------------------------------------------------------------------------
  // Pagination State
  // ---------------------------------------------------------------------------

  const pageSize = enableUrlSync
    ? urlState.pageSize
    : enablePersistence
      ? preferences.preferences.pageSize
      : initialPageSize;

  const pageIndex = enableUrlSync ? urlState.page : 0;

  const pageCount = isServerSide ? Math.ceil(serverTotal / pageSize) : undefined;

  // ---------------------------------------------------------------------------
  // Column Configuration
  // ---------------------------------------------------------------------------

  // Apply preference overrides to columns
  const configuredColumns = useMemo(() => {
    const { columnOrder, columnWidths, hiddenColumns, frozenColumns } = preferences.preferences;

    // Map columns with preference overrides
    let cols = columns.map((col) => {
      const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
      if (!colId) return col;

      return {
        ...col,
        size: columnWidths[colId] ?? col.meta?.defaultWidth ?? col.size,
        enableHiding: true,
      } as ColumnDef<TData, unknown>;
    });

    // Sort frozen columns to the start
    if (frozenColumns.length > 0) {
      const frozen = cols.filter((col) => {
        const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
        return colId && frozenColumns.includes(colId);
      });
      const notFrozen = cols.filter((col) => {
        const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
        return !colId || !frozenColumns.includes(colId);
      });
      cols = [...frozen, ...notFrozen];
    }

    // Apply column order if specified
    if (columnOrder.length > 0) {
      const orderMap = new Map(columnOrder.map((id, idx) => [id, idx]));
      cols = [...cols].sort((a, b) => {
        const aId = 'accessorKey' in a ? String(a.accessorKey) : a.id;
        const bId = 'accessorKey' in b ? String(b.accessorKey) : b.id;
        const aIdx = aId ? (orderMap.get(aId) ?? 999) : 999;
        const bIdx = bId ? (orderMap.get(bId) ?? 999) : 999;
        return aIdx - bIdx;
      });
    }

    return cols;
  }, [columns, preferences.preferences]);

  // Column visibility based on preferences
  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const colId of preferences.preferences.hiddenColumns) {
      visibility[colId] = false;
    }
    return visibility;
  }, [preferences.preferences.hiddenColumns]);

  // ---------------------------------------------------------------------------
  // TanStack Table Instance
  // ---------------------------------------------------------------------------

  const table = useReactTable({
    data: effectiveData,
    columns: configuredColumns,
    state: {
      sorting,
      pagination: {
        pageIndex,
        pageSize,
      },
      columnVisibility,
    },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isServerSide ? undefined : getSortedRowModel(),
    getFilteredRowModel: isServerSide ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isServerSide ? undefined : getPaginationRowModel(),
    manualPagination: isServerSide,
    manualSorting: isServerSide,
    manualFiltering: isServerSide,
    pageCount,
    getRowId: (row) => getRowId(row, rowIdAccessor),
  });

  // ---------------------------------------------------------------------------
  // Server-Side Data Fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!dataFetcher) return;

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);

    try {
      const result: ServerFetchResult<TData> = await dataFetcher({
        sort: tanstackToSortState(sorting),
        page: pageIndex,
        pageSize,
        filters: urlState.filters,
        search: urlState.search,
      });

      // Only update if this is still the latest fetch
      if (fetchId === fetchIdRef.current) {
        setServerData(result.rows);
        setServerTotal(result.total);
        setIsLoading(false);
      }
    } catch (error) {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
        console.error('DataGrid fetch error:', error);
      }
    }
  }, [dataFetcher, sorting, pageIndex, pageSize, urlState.filters, urlState.search]);

  // Fetch when dependencies change
  useEffect(() => {
    if (dataFetcher) {
      fetchData();
    }
  }, [fetchData, dataFetcher]);

  // ---------------------------------------------------------------------------
  // Selection Sync
  // ---------------------------------------------------------------------------

  // Get all row IDs for shift-select support
  const allRowIds = useMemo(() => {
    return table.getRowModel().rows.map((row: Row<TData>) => row.id);
  }, [table.getRowModel().rows]);

  // Wrap selectRow to include allRowIds
  const selectRowWithIds = useCallback(
    (id: string, event: React.MouseEvent | React.KeyboardEvent) => {
      selection.selectRow(id, event, allRowIds);
    },
    [selection, allRowIds]
  );

  // Notify when selection changes
  useEffect(() => {
    if (onSelectionChange && enableSelection) {
      onSelectionChange(selection.selectedIds);
    }
  }, [selection.selectedIds, onSelectionChange, enableSelection]);

  // ---------------------------------------------------------------------------
  // Imperative Methods
  // ---------------------------------------------------------------------------

  const refresh = useCallback(() => {
    if (dataFetcher) {
      fetchData();
    }
  }, [dataFetcher, fetchData]);

  const resetPreferences = useCallback(() => {
    preferences.resetPreferences();
  }, [preferences]);

  const clearSelection = useCallback(() => {
    selection.clearSelection();
  }, [selection]);

  const exportCsv = useCallback(
    (filename?: string) => {
      exportToCsv(columns, effectiveData, filename);
    },
    [columns, effectiveData]
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    table,
    isLoading,
    preferences,
    selection: {
      ...selection,
      selectRow: selectRowWithIds,
    },
    urlState,
    refresh,
    resetPreferences,
    clearSelection,
    exportCsv,
  };
}
