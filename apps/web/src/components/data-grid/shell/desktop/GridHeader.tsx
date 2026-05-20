/**
 * GridHeader Component (Desktop)
 *
 * Desktop table header with sortable columns using CSS Grid for perfect alignment.
 * Vercel/Apple crisp-minimal aesthetic with 40px height.
 */

'use client';

import { flexRender, type Table } from '@tanstack/react-table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColumnSizing } from '../../hooks/useColumnSizing';
import { SelectAllCheckbox } from '../shared/SelectAllCheckbox';

export interface GridHeaderProps<TData> {
  table: Table<TData>;
  enableSelection?: boolean;
}

/**
 * GridHeader renders column headers for desktop table view.
 *
 * Design:
 * - Layout: CSS Grid with shared templateColumns from useColumnSizing
 * - Height: 40px (--grid-header-height)
 * - Typography: text-xs uppercase tracking-wider font-medium text-muted-foreground
 * - Border: border-b border-border/40
 * - Sort indicators: ChevronUp/ChevronDown (h-3.5 w-3.5) with strokeWidth={1.5}
 * - NO vertical borders between columns
 * - Sticky header with bg-background
 * - Actions column (first): empty 132px spacer
 * - Checkbox column (second if enabled): tri-state SelectAllCheckbox
 *
 * @example
 * <GridHeader table={table} enableSelection />
 */
export function GridHeader<TData>({ table, enableSelection }: GridHeaderProps<TData>) {
  const { templateColumns } = useColumnSizing();
  const { getHeaderGroups, toggleAllRowsSelected, getIsAllRowsSelected, getIsSomeRowsSelected } = table;

  return (
    <div
      className="sticky top-0 z-10 grid items-center border-b border-border/40 bg-background"
      style={{
        height: 'var(--grid-header-height, 40px)',
        gridTemplateColumns: templateColumns,
      }}
      role="row"
    >
      {/* Actions column header (first) - empty spacer */}
      <div className="flex items-center" role="columnheader" aria-label="Actions" />

      {/* Checkbox column header (second if enabled) */}
      {enableSelection && (
        <div className="flex items-center justify-center" role="columnheader" aria-label="Select">
          <SelectAllCheckbox
            checked={getIsAllRowsSelected() ? 'checked' : getIsSomeRowsSelected() ? 'indeterminate' : 'unchecked'}
            onCheckedChange={(checked) => toggleAllRowsSelected(checked)}
            currentPageCount={table.getRowModel().rows.length}
            totalRows={table.getRowCount()}
            pageSize={table.getState().pagination?.pageSize || 25}
          />
        </div>
      )}

      {/* Data column headers */}
      {getHeaderGroups().map((headerGroup) =>
        headerGroup.headers.map((header) => {
          // Skip internal columns (already rendered above)
          if (header.id === 'select' || header.id === 'actions') return null;

          const isSortable = header.column.getCanSort();
          const sortDirection = header.column.getIsSorted();

          return (
            <div
              key={header.id}
              className="flex items-center px-4"
              role="columnheader"
            >
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors',
                  isSortable && 'cursor-pointer hover:text-foreground'
                )}
                onClick={isSortable ? () => header.column.toggleSorting() : undefined}
                disabled={!isSortable}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
                {isSortable && sortDirection && (
                  <span className="ml-auto">
                    {sortDirection === 'asc' ? (
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                  </span>
                )}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
