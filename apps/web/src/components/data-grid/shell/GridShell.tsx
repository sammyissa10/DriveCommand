/**
 * GridShell Component (Main Responsive Container)
 *
 * Main container that orchestrates the entire DataGrid shell.
 * Switches between desktop table and mobile cards based on breakpoint.
 */

'use client';

import { type Table, type Row } from '@tanstack/react-table';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { createContext, useContext, useRef, useState } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { GridHeader } from './desktop/GridHeader';
import { GridBody } from './desktop/GridBody';
import { GridFooter } from './desktop/GridFooter';
import { GridCardList } from './mobile/GridCardList';
import { MobileFAB } from './mobile/MobileFAB';
import { GridToolbar } from './shared/GridToolbar';
import { BulkActionsBar } from './shared/BulkActionsBar';
import { ColumnSizingProvider } from '../hooks/useColumnSizing';
import { cn } from '@/lib/utils';
import type { ExtendedColumnDef, GridFilter, ServerDataFetcher } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get row height for density mode.
 * NOTE: Density is always 'normal' (48px) in this redesign.
 */
export function getDensityRowHeight(density: string): number {
  // Always return 48px (design constraint: fixed row height)
  return 48;
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
  /** Export config */
  exportFilename?: string;
  dataFetcher?: ServerDataFetcher<TData>;
  rowIdAccessor?: (row: TData) => string;
  /** New button */
  showNew?: boolean;
  onNew?: () => void;
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
 * Design:
 * - Desktop (>=768px): Table layout with header/body/footer
 * - Mobile (<768px): Card list with FAB
 * - Container: bg-background border border-border rounded-lg overflow-hidden
 * - Focus: focus-visible:ring-2 ring-primary
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
  columns,
  hiddenColumns,
  onHiddenColumnsChange,
  exportFilename,
  dataFetcher,
  rowIdAccessor,
  showNew,
  onNew,
  bulkActions,
  onClearSelection,
  primaryColumn,
  metadataColumns,
  statusColumn,
  className,
}: GridShellProps<TData>) {
  const { isMobile } = useBreakpoint();
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedCount = selectedIds?.size || 0;

  // Virtualizer for desktop table
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Fixed row height
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
      <div
        role="grid"
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          className
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Toolbar */}
        <GridToolbar
          search={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onFilterClick={onFilterClick}
          columns={columns}
          hiddenColumns={hiddenColumns}
          onHiddenColumnsChange={onHiddenColumnsChange}
          exportFilename={exportFilename}
          dataFetcher={dataFetcher}
          rowIdAccessor={rowIdAccessor}
          showNew={showNew}
          onNew={onNew}
        />

        {/* Bulk actions bar (desktop: below toolbar, mobile: fixed bottom) */}
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
          /* Mobile: Card view */
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
          />
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

        {/* Bulk actions bar (mobile: fixed bottom) */}
        {selectedCount > 0 && isMobile && (
          <BulkActionsBar
            selectedCount={selectedCount}
            actions={bulkActions}
            onClearSelection={onClearSelection}
          />
        )}

        {/* FAB (mobile only, hidden during selection) */}
        {showNew && onNew && isMobile && selectedCount === 0 && (
          <MobileFAB onClick={onNew} visible label="Create new" />
        )}
      </div>
    </GridShellContext.Provider>
  );
}
