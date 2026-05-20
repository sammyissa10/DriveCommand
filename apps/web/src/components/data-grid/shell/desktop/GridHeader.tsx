/**
 * GridHeader Component (Desktop)
 *
 * Desktop table header with sortable columns.
 * Vercel/Apple crisp-minimal aesthetic with 40px height.
 */

'use client';

import { flexRender, type Header, type Table } from '@tanstack/react-table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface GridHeaderProps<TData> {
  table: Table<TData>;
  enableSelection?: boolean;
}

/**
 * GridHeader renders column headers for desktop table view.
 *
 * Design:
 * - Height: 40px (--grid-header-height)
 * - Typography: text-xs uppercase tracking-wider font-medium text-muted-foreground
 * - Border: border-b border-border/40
 * - Sort indicators: ChevronUp/ChevronDown (h-3.5 w-3.5) with strokeWidth={1.5}
 * - NO vertical borders between columns
 * - Sticky header with bg-background
 *
 * @example
 * <GridHeader table={table} enableSelection />
 */
export function GridHeader<TData>({ table, enableSelection }: GridHeaderProps<TData>) {
  const { getHeaderGroups, toggleAllRowsSelected, getIsAllRowsSelected } = table;

  return (
    <div
      className="sticky top-0 z-10 flex items-center border-b border-border/40 bg-background"
      style={{ height: 'var(--grid-header-height, 40px)' }}
      role="row"
    >
      {getHeaderGroups().map((headerGroup) => (
        <div key={headerGroup.id} className="flex w-full">
          {headerGroup.headers.map((header) => {
            const isCheckbox = header.id === 'select';
            const isSortable = header.column.getCanSort();
            const sortDirection = header.column.getIsSorted();

            return (
              <div
                key={header.id}
                className={cn(
                  'flex items-center',
                  isCheckbox ? 'w-12 justify-center' : 'flex-1 px-4'
                )}
                style={{
                  width: isCheckbox ? '48px' : header.getSize(),
                  minWidth: isCheckbox ? '48px' : header.getSize(),
                }}
                role="columnheader"
              >
                {isCheckbox && enableSelection ? (
                  <Checkbox
                    checked={getIsAllRowsSelected()}
                    onCheckedChange={(checked) => toggleAllRowsSelected(!!checked)}
                    aria-label="Select all rows"
                  />
                ) : (
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors',
                      isSortable && 'cursor-pointer hover:text-foreground'
                    )}
                    onClick={
                      isSortable ? () => header.column.toggleSorting() : undefined
                    }
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
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
