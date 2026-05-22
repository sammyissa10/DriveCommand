/**
 * GridShell Component (Main Responsive Container) — DriveCommand Brand
 *
 * Main container that orchestrates the entire DataGrid shell.
 * Switches between desktop table and mobile cards based on breakpoint.
 * Paper white surface, 8px radius, Signal Blue focus ring.
 *
 * COLUMN STATE MANAGEMENT:
 * GridShell now internally uses useGridPreferences when column callbacks
 * aren't provided, so column visibility/order "just works" automatically.
 */

'use client';

import { type Table, type Row } from '@tanstack/react-table';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { createContext, useContext, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useGridPreferences } from '../core/useGridPreferences';
import { GridHeader } from './desktop/GridHeader';
import { GridBody } from './desktop/GridBody';
import { GridFooter } from './desktop/GridFooter';
import { GridCardList } from './mobile/GridCardList';
import { MobileTableView } from './mobile/MobileTableView';
import { MobileFAB } from './mobile/MobileFAB';
import { MobileBulkActionsBar } from './mobile/MobileBulkActionsBar';
import type { MobileViewMode } from './mobile/MobileToolbar';
import { GridToolbar } from './shared/GridToolbar';
import { BulkActionsBar } from './shared/BulkActionsBar';
import { ColumnSizingProvider } from '../hooks/useColumnSizing';
import { cn } from '@/lib/utils';
import type { ExtendedColumnDef, GridFilter, ServerDataFetcher } from '../core/types';

// Import tokens CSS
import '../tokens/grid-tokens.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get row height for density mode.
 * NOTE: Density is always 'normal' (52px) in this redesign.
 */
export function getDensityRowHeight(density: string): number {
  // Always return 52px (design constraint: fixed row height with generous padding)
  return 52;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface GridShellContextValue {
  focusedCell: { rowIndex: number; colIndex: number } | null;
  setFocusedCell: (cell: { rowIndex: number; colIndex: number } | null) => void;
  density: 'normal'; // Always normal (no toggle)
  gridId: string;
}

const GridShellContext = createContext<GridShellContextValue | null>(null);

export function useGridShellContext() {
  const context = useContext(GridShellContext);
  if (!context) {
    throw new Error('useGridShellContext must be used within GridShell');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GridShellProps<TData> {
  /** Grid ID for persistence */
  gridId: string;
  /** TanStack Table instance */
  table: Table<TData>;
  /** Rows array */
  rows: Row<TData>[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Enable row selection */
  enableSelection?: boolean;
  /** Selected row IDs */
  selectedIds?: Set<string>;
  /** Row select handler */
  onRowSelect?: (rowId: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  /** Row double-click handler */
  onRowDoubleClick?: (row: TData) => void;
  /** Quick actions renderer */
  renderQuickActions?: (row: TData) => React.ReactNode;
  /** Pagination state */
  pagination?: {
    pageIndex: number;
    pageSize: number;
    pageCount: number;
    totalRows: number;
    canPreviousPage: boolean;
    canNextPage: boolean;
    previousPage: () => void;
    nextPage: () => void;
    setPageSize: (size: number) => void;
  };
  /** Search state */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter state */
  filters?: GridFilter[];
  onFiltersChange?: (filters: GridFilter[]) => void;
  onFilterClick?: () => void;
  /** Columns */
  columns?: ExtendedColumnDef<TData>[];
  hiddenColumns?: string[];
  onHiddenColumnsChange?: (columns: string[]) => void;
  /** Column order (IDs in display order) */
  columnOrder?: string[];
  /** Column order change handler */
  onColumnOrderChange?: (order: string[]) => void;
  /** Export config */
  exportFilename?: string;
  dataFetcher?: ServerDataFetcher<TData>;
  rowIdAccessor?: (row: TData) => string;
  /** New button */
  showNew?: boolean;
  onNew?: () => void;
  /** Record name for dynamic button label (e.g., "Client", "Driver") */
  recordName?: string;
  /** Bulk actions */
  bulkActions?: Array<{
    id: string;
    label: string;
    icon: any;
    onClick: () => void;
    destructive?: boolean;
  }>;
  onClearSelection?: () => void;
  /** Mobile card config */
  primaryColumn?: string;
  metadataColumns?: string[];
  statusColumn?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * GridShell is the main responsive container for the DataGrid.
 *
 * Design (DriveCommand Brand):
 * - Desktop (>=768px): Table layout with header/body/footer
 * - Mobile (<768px): Card list with FAB
 * - Container: Paper white (#FFFFFF), 8px radius, N200 at 50% border
 * - Focus: focus-visible:ring-2 Signal Blue
 * - Keyboard navigation: arrow keys, space, escape
 *
 * @example
 * <GridShell
 *   gridId="my-grid"
 *   table={table}
 *   rows={rows}
 *   isLoading={isLoading}
 *   enableSelection
 *   selectedIds={selectedIds}
 *   pagination={paginationState}
 * />
 */
export function GridShell<TData>({
  gridId,
  table,
  rows,
  isLoading,
  error,
  onRefresh,
  enableSelection,
  selectedIds,
  onRowSelect,
  onRowDoubleClick,
  renderQuickActions,
  pagination,
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onFiltersChange,
  onFilterClick,
  columns: columnsProp,
  hiddenColumns: hiddenColumnsProp,
  onHiddenColumnsChange: onHiddenColumnsChangeProp,
  columnOrder: columnOrderProp,
  onColumnOrderChange: onColumnOrderChangeProp,
  exportFilename,
  dataFetcher,
  rowIdAccessor,
  showNew,
  onNew,
  recordName,
  bulkActions,
  onClearSelection,
  primaryColumn,
  metadataColumns,
  statusColumn,
  className,
}: GridShellProps<TData>) {
  // Use internal preferences when external callbacks not provided
  // This makes column visibility/order "just work" automatically
  const preferences = useGridPreferences(gridId);

  // Determine whether to use external or internal column state
  const useInternalColumnState = !onHiddenColumnsChangeProp && !onColumnOrderChangeProp;

  // Effective column state - use external props or internal preferences
  const effectiveHiddenColumns = useInternalColumnState
    ? preferences.preferences.hiddenColumns
    : (hiddenColumnsProp || []);

  const effectiveColumnOrder = useInternalColumnState
    ? preferences.preferences.columnOrder
    : (columnOrderProp || []);

  // Effective callbacks - use external or internal handlers
  const handleHiddenColumnsChange = useCallback((columns: string[]) => {
    if (onHiddenColumnsChangeProp) {
      onHiddenColumnsChangeProp(columns);
    } else {
      preferences.setHiddenColumns(columns);
    }
  }, [onHiddenColumnsChangeProp, preferences]);

  const handleColumnOrderChange = useCallback((order: string[]) => {
    if (onColumnOrderChangeProp) {
      onColumnOrderChangeProp(order);
    } else {
      preferences.setColumnOrder(order);
    }
  }, [onColumnOrderChangeProp, preferences]);

  // Derive columns from table if not provided explicitly
  // This ensures the Columns toggle always has data to display
  const derivedColumns = useMemo(() => {
    if (columnsProp && columnsProp.length > 0) {
      return columnsProp;
    }
    // Extract column definitions from TanStack Table instance
    return table.getAllColumns().map((column) => ({
      id: column.id,
      header: typeof column.columnDef.header === 'string'
        ? column.columnDef.header
        : column.id,
      meta: column.columnDef.meta,
    })) as ExtendedColumnDef<TData>[];
  }, [columnsProp, table]);

  // Sync hidden columns with TanStack Table's column visibility state
  // This ensures the table actually hides/shows columns when preferences change
  useEffect(() => {
    if (effectiveHiddenColumns.length === 0) {
      // Show all columns
      table.setColumnVisibility({});
    } else {
      // Build visibility map: false = hidden, true (or omitted) = visible
      const visibilityMap: Record<string, boolean> = {};
      effectiveHiddenColumns.forEach((colId) => {
        visibilityMap[colId] = false;
      });
      table.setColumnVisibility(visibilityMap);
    }
  }, [table, effectiveHiddenColumns]);

  // Sync column order with TanStack Table's column order state
  // This ensures the table actually reorders columns when preferences change
  useEffect(() => {
    if (effectiveColumnOrder.length > 0) {
      table.setColumnOrder(effectiveColumnOrder);
    }
  }, [table, effectiveColumnOrder]);

  // Get current sort state from TanStack Table for mobile sort sheet
  const sortingState = table.getState().sorting;
  const currentSort = useMemo(() => {
    if (sortingState.length === 0) return null;
    return { id: sortingState[0].id, desc: sortingState[0].desc };
  }, [sortingState]);

  // Handle sort change from mobile sort sheet
  const handleSortChange = useCallback(
    (sort: { id: string; desc: boolean } | null) => {
      if (sort === null) {
        table.setSorting([]);
      } else {
        table.setSorting([{ id: sort.id, desc: sort.desc }]);
      }
    },
    [table]
  );

  // Mobile view mode state (cards vs table)
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('cards');

  // Load view mode from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`grid-view-mode-${gridId}`);
      if (stored === 'cards' || stored === 'table') {
        setMobileViewMode(stored);
      }
    }
  }, [gridId]);

  // Handle view mode change with persistence
  const handleViewModeChange = useCallback(
    (mode: MobileViewMode) => {
      setMobileViewMode(mode);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`grid-view-mode-${gridId}`, mode);
      }
    },
    [gridId]
  );

  const { isMobile } = useBreakpoint();
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedCount = selectedIds?.size || 0;

  // Virtualizer for desktop table
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52, // Fixed row height (52px for generous spacing)
    overscan: 5,
  });

  // Context value
  const contextValue: GridShellContextValue = {
    focusedCell,
    setFocusedCell,
    density: 'normal',
    gridId,
  };

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!focusedCell) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (focusedCell.rowIndex > 0) {
          setFocusedCell({ ...focusedCell, rowIndex: focusedCell.rowIndex - 1 });
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (focusedCell.rowIndex < rows.length - 1) {
          setFocusedCell({ ...focusedCell, rowIndex: focusedCell.rowIndex + 1 });
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (focusedCell.colIndex > 0) {
          setFocusedCell({ ...focusedCell, colIndex: focusedCell.colIndex - 1 });
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        const maxCol = table.getAllColumns().length - 1;
        if (focusedCell.colIndex < maxCol) {
          setFocusedCell({ ...focusedCell, colIndex: focusedCell.colIndex + 1 });
        }
        break;
      case ' ':
        e.preventDefault();
        const row = rows[focusedCell.rowIndex];
        if (row && onRowSelect) {
          onRowSelect(row.id, e);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClearSelection?.();
        break;
    }
  };

  return (
    <GridShellContext.Provider value={contextValue}>
      {/* Wrapper for grid + fixed elements (FAB/BulkActions need to be outside overflow-hidden) */}
      <>
        <div
          role="grid"
          className={cn(
            'overflow-hidden',
            // Shape: 8px radius (brand container radius)
            'rounded-lg',
            // Border: N200 at 50%
            'border',
            // Background: Paper white
            'bg-[var(--grid-paper,#FFFFFF)]',
            // Focus ring: Signal Blue
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--grid-accent,#0A21C0)]',
            // Mobile: no bottom rounding when bulk bar visible
            isMobile && selectedCount > 0 && 'rounded-b-none',
            className
          )}
          style={{
            borderColor: 'var(--grid-border-container)',
          }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* Toolbar */}
          <GridToolbar
            gridId={gridId}
            search={search}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onFilterClick={onFilterClick}
            columns={derivedColumns}
            hiddenColumns={effectiveHiddenColumns}
            onHiddenColumnsChange={handleHiddenColumnsChange}
            columnOrder={effectiveColumnOrder}
            onColumnOrderChange={handleColumnOrderChange}
            currentSort={currentSort}
            onSortChange={handleSortChange}
            viewMode={mobileViewMode}
            onViewModeChange={handleViewModeChange}
            exportFilename={exportFilename}
            dataFetcher={dataFetcher}
            rowIdAccessor={rowIdAccessor}
            visibleRows={rows.map((r) => r.original)}
            selectedIds={selectedIds}
            showNew={showNew}
            onNew={onNew}
            recordName={recordName}
          />

          {/* Bulk actions bar (desktop only: below toolbar) */}
          {selectedCount > 0 && !isMobile && (
            <BulkActionsBar
              selectedCount={selectedCount}
              actions={bulkActions}
              onClearSelection={onClearSelection}
            />
          )}

          {/* Desktop: Table view */}
          {!isMobile ? (
            <ColumnSizingProvider table={table} enableSelection={enableSelection}>
              <div ref={parentRef} className="overflow-auto" style={{ maxHeight: '600px' }}>
                <GridHeader table={table} enableSelection={enableSelection} />
                <GridBody
                  table={table}
                  rows={rows}
                  virtualizer={virtualizer}
                  isLoading={isLoading}
                  error={error}
                  onRefresh={onRefresh}
                  enableSelection={enableSelection}
                  selectedIds={selectedIds}
                  onRowSelect={onRowSelect}
                  onRowDoubleClick={onRowDoubleClick}
                  renderQuickActions={renderQuickActions}
                />
              </div>
            </ColumnSizingProvider>
          ) : (
            /* Mobile: Card or Table view based on viewMode */
            mobileViewMode === 'table' ? (
              <MobileTableView
                table={table}
                rows={rows}
                isLoading={isLoading}
                selectedIds={selectedIds}
                onRowSelect={onRowSelect}
                onRowDoubleClick={onRowDoubleClick}
                primaryColumn={primaryColumn}
                hiddenColumns={effectiveHiddenColumns}
              />
            ) : (
              <GridCardList
                rows={rows}
                isLoading={isLoading}
                selectedIds={selectedIds}
                isMultiSelectMode={selectedCount > 0}
                onCardPress={onRowDoubleClick}
                onCardLongPress={(rowId) => onRowSelect?.(rowId, {} as React.MouseEvent)}
                onCardSelect={(rowId) => onRowSelect?.(rowId, {} as React.MouseEvent)}
                primaryColumn={primaryColumn}
                metadataColumns={metadataColumns}
                statusColumn={statusColumn}
                recordName={recordName}
              />
            )
          )}

          {/* Footer (desktop only) */}
          {!isMobile && pagination && (
            <GridFooter
              pageIndex={pagination.pageIndex}
              pageCount={pagination.pageCount}
              pageSize={pagination.pageSize}
              totalRows={pagination.totalRows}
              canPreviousPage={pagination.canPreviousPage}
              canNextPage={pagination.canNextPage}
              previousPage={pagination.previousPage}
              nextPage={pagination.nextPage}
              setPageSize={pagination.setPageSize}
            />
          )}
        </div>

        {/* Mobile bulk actions bar - OUTSIDE overflow-hidden container */}
        {selectedCount > 0 && isMobile && (
          <MobileBulkActionsBar
            selectedCount={selectedCount}
            actions={bulkActions}
            onClearSelection={onClearSelection}
          />
        )}

        {/* FAB - OUTSIDE overflow-hidden container for proper fixed positioning */}
        {showNew && onNew && isMobile && selectedCount === 0 && (
          <MobileFAB
            onClick={onNew}
            visible
            label={recordName ? `Add New ${recordName}` : 'Create new'}
          />
        )}
      </>
    </GridShellContext.Provider>
  );
}
