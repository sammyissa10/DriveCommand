'use client';

/**
 * GridFooter - Sticky footer with pagination controls.
 *
 * Displays row count info, page size selector, and navigation buttons.
 */

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataGridContext } from '../core/DataGrid';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridFooterProps {
  /** Available page sizes */
  pageSizeOptions?: number[];
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridFooter({
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: GridFooterProps) {
  const { table } = useDataGridContext();

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const pageCount = table.getPageCount();
  const totalRows = table.getFilteredRowModel().rows.length;

  // Calculate showing range
  const startRow = pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  // Navigation handlers
  const canPreviousPage = table.getCanPreviousPage();
  const canNextPage = table.getCanNextPage();

  const goToFirstPage = () => table.setPageIndex(0);
  const goToPreviousPage = () => table.previousPage();
  const goToNextPage = () => table.nextPage();
  const goToLastPage = () => table.setPageIndex(pageCount - 1);

  const handlePageSizeChange = (value: string) => {
    table.setPageSize(Number(value));
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between p-2 border-t border-border bg-background',
        className
      )}
    >
      {/* Row count info */}
      <div className="text-sm text-muted-foreground">
        {totalRows > 0 ? (
          <>
            Showing {startRow}-{endRow} of {totalRows} result{totalRows !== 1 ? 's' : ''}
          </>
        ) : (
          'No results'
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-2">
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page indicator */}
        <span className="text-sm text-muted-foreground mx-2">
          Page {pageCount > 0 ? pageIndex + 1 : 0} of {pageCount}
        </span>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToFirstPage}
            disabled={!canPreviousPage}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToPreviousPage}
            disabled={!canPreviousPage}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToNextPage}
            disabled={!canNextPage}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToLastPage}
            disabled={!canNextPage}
            aria-label="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
