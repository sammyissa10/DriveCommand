/**
 * GridBody Component (Desktop)
 *
 * Virtualized body container for desktop table rows.
 * Handles empty, loading, and error states.
 */

'use client';

import { type Table, type Row } from '@tanstack/react-table';
import { type Virtualizer } from '@tanstack/react-virtual';
import { GridRow } from './GridRow';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSkeleton } from '../shared/LoadingSkeleton';
import { ErrorState } from '../shared/ErrorState';

export interface GridBodyProps<TData> {
  table: Table<TData>;
  rows: Row<TData>[];
  virtualizer?: Virtualizer<HTMLDivElement, Element>;
  isLoading?: boolean;
  error?: Error;
  onRefresh?: () => void;
  enableSelection?: boolean;
  selectedIds?: Set<string>;
  onRowSelect?: (rowId: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onRowDoubleClick?: (row: TData) => void;
  renderQuickActions?: (row: TData) => React.ReactNode;
  className?: string;
}

/**
 * GridBody renders virtualized table rows with state handling.
 *
 * Design:
 * - Scrollable container with overflow-auto
 * - Virtualizes rows for performance
 * - Shows EmptyState when rows.length === 0
 * - Shows LoadingSkeleton when isLoading
 * - Shows ErrorState when error
 *
 * @example
 * <GridBody
 *   table={table}
 *   rows={rows}
 *   virtualizer={virtualizer}
 *   isLoading={isLoading}
 *   error={error}
 *   onRefresh={refetch}
 * />
 */
export function GridBody<TData>({
  table,
  rows,
  virtualizer,
  isLoading,
  error,
  onRefresh,
  enableSelection,
  selectedIds,
  onRowSelect,
  onRowDoubleClick,
  renderQuickActions,
  className,
}: GridBodyProps<TData>) {
  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        <LoadingSkeleton
          rows={5}
          columns={table.getAllColumns().length}
          showHeader={false}
        />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <ErrorState error={error} onRetry={onRefresh} />
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState variant="no-data" />
      </div>
    );
  }

  // Virtualized rows
  const virtualRows = virtualizer?.getVirtualItems() || [];

  return (
    <div className={className} role="rowgroup">
      {virtualizer ? (
        // Virtualized rendering
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const rowId = row.id;
            const isSelected = selectedIds?.has(rowId) || false;

            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <GridRow
                  row={row}
                  rowIndex={virtualRow.index}
                  isSelected={isSelected}
                  enableSelection={enableSelection}
                  onSelect={
                    onRowSelect
                      ? () => onRowSelect(rowId, {} as React.MouseEvent)
                      : undefined
                  }
                  onDoubleClick={
                    onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined
                  }
                  quickActions={
                    renderQuickActions ? renderQuickActions(row.original) : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      ) : (
        // Non-virtualized rendering
        rows.map((row, index) => {
          const rowId = row.id;
          const isSelected = selectedIds?.has(rowId) || false;

          return (
            <GridRow
              key={row.id}
              row={row}
              rowIndex={index}
              isSelected={isSelected}
              enableSelection={enableSelection}
              onSelect={
                onRowSelect
                  ? () => onRowSelect(rowId, {} as React.MouseEvent)
                  : undefined
              }
              onDoubleClick={
                onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined
              }
              quickActions={
                renderQuickActions ? renderQuickActions(row.original) : undefined
              }
            />
          );
        })
      )}
    </div>
  );
}
