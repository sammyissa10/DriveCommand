/**
 * GridHeader Component (Desktop) — DriveCommand Brand
 *
 * Desktop table header with sortable columns using CSS Grid for perfect alignment.
 * White surface, Inter typography, Signal Blue sort indicators on active.
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
 * Design (DriveCommand Brand):
 * - Layout: CSS Grid with shared templateColumns from useColumnSizing
 * - Height: 40px (--grid-header-height)
 * - Background: Paper white (#FFFFFF) — NOT blue tint
 * - Typography: Inter, text-xs, font-medium, uppercase, tracking-[0.06em], N500 (#6B6E78)
 * - Border: 1px N200 at 60% opacity
 * - Sort indicators: hidden until hover or active
 *   - Default: opacity-0
 *   - Column hover: opacity-40
 *   - Active: opacity-100 (Signal Blue on active)
 * - Column dividers: 1px N100 at 40%, full height
 * - Resize handles: 2px Signal Blue on hover, cursor col-resize
 *
 * @example
 * <GridHeader table={table} enableSelection />
 */
export function GridHeader<TData>({ table, enableSelection }: GridHeaderProps<TData>) {
  const { templateColumns, handleResizeStart, handleAutoFit, resizingInfo } = useColumnSizing();
  const { getHeaderGroups, toggleAllRowsSelected, getIsAllRowsSelected, getIsSomeRowsSelected } = table;

  // Get data columns (exclude select/actions)
  const dataHeaders = getHeaderGroups().flatMap((headerGroup) =>
    headerGroup.headers.filter((header) => header.id !== 'select' && header.id !== 'actions')
  );

  return (
    <div
      className={cn(
        'sticky top-0 z-10 grid items-center',
        'border-b',
        // Background: Paper white
        'bg-[var(--grid-paper,#FFFFFF)]'
      )}
      style={{
        height: 'var(--grid-header-height, 40px)',
        gridTemplateColumns: templateColumns,
        borderColor: 'var(--grid-border-header)',
        fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
      }}
      role="row"
    >
      {/* Checkbox column header (FIRST if enabled) */}
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

      {/* Actions column header (SECOND) - empty spacer */}
      <div className="flex items-center" role="columnheader" aria-label="Actions" />

      {/* Data column headers with dividers and resize handles */}
      {dataHeaders.map((header, index) => {
        const isSortable = header.column.getCanSort();
        const sortDirection = header.column.getIsSorted();
        const isLastColumn = index === dataHeaders.length - 1;

        return (
          <div
            key={header.id}
            // CRITICAL: min-w-0 + overflow-hidden ensures header shrinks with Grid column
            className="group/header relative flex h-full items-center px-4 min-w-0 overflow-hidden"
            role="columnheader"
          >
            <button
              type="button"
              className={cn(
                // Typography: Inter, text-xs, uppercase, tracking-wider
                'flex w-full items-center text-left text-xs font-medium uppercase truncate',
                // Color: N500
                'text-[var(--grid-n500,#6B6E78)]',
                'transition-colors duration-150',
                isSortable && 'cursor-pointer hover:text-[var(--grid-ink,#141619)]'
              )}
              style={{
                letterSpacing: '0.06em',
                fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
              }}
              onClick={isSortable ? () => header.column.toggleSorting() : undefined}
              disabled={!isSortable}
              // For auto-fit measurement
              data-header-id={header.id}
            >
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
              {isSortable && (
                <span
                  className={cn(
                    'ml-1.5 transition-opacity duration-150',
                    // Default: hidden
                    'opacity-0',
                    // Group hover: faint
                    'group-hover/header:opacity-40',
                    // Active: full
                    sortDirection && 'opacity-100',
                    // Color: Signal Blue when active
                    sortDirection && 'text-[var(--grid-accent,#0A21C0)]'
                  )}
                >
                  {sortDirection === 'desc' ? (
                    <ChevronDown className="h-3 w-3" strokeWidth={1.6} />
                  ) : (
                    <ChevronUp className="h-3 w-3" strokeWidth={1.6} />
                  )}
                </span>
              )}
            </button>

            {/* Column divider with resize handle (not after last column) */}
            {!isLastColumn && (
              <>
                {/* Visible divider line */}
                <div
                  className={cn(
                    'absolute right-0 top-0 h-full w-[1px] pointer-events-none',
                    // Default: N100 at 40%
                    'bg-[var(--grid-border-divider)]',
                    // Actively resizing: Signal Blue
                    resizingInfo?.columnId === header.id && 'w-[2px] bg-[var(--grid-accent,#0A21C0)]'
                  )}
                />
                {/* Invisible wider hit area for easier grabbing (12px) */}
                <div
                  className={cn(
                    'absolute top-0 h-full w-3 -right-1.5',
                    'cursor-col-resize',
                    // Hover effect on the visible line via group
                    'hover:after:absolute hover:after:left-1/2 hover:after:-translate-x-1/2',
                    'hover:after:h-full hover:after:w-[2px] hover:after:bg-[var(--grid-accent,#0A21C0)]'
                  )}
                  onMouseDown={(e) => handleResizeStart?.(header.id, e)}
                  onDoubleClick={() => handleAutoFit?.(header.id)}
                  title="Drag to resize, double-click to auto-fit"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${header.id} column`}
                />
                {/* Width indicator tooltip during resize */}
                {resizingInfo?.columnId === header.id && (
                  <div
                    className={cn(
                      'absolute -right-8 top-full mt-1 z-20',
                      'px-2 py-1 rounded text-xs font-medium',
                      'bg-[var(--grid-ink,#141619)] text-white',
                      'shadow-lg whitespace-nowrap'
                    )}
                    style={{ fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)" }}
                  >
                    {resizingInfo.width}px
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
