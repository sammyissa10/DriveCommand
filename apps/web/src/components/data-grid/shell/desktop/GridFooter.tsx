/**
 * GridFooter Component (Desktop)
 *
 * Pagination controls for desktop table view.
 * Compact layout with page info and navigation.
 */

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface GridFooterProps {
  /** Current page (0-indexed) */
  pageIndex: number;
  /** Total number of pages */
  pageCount: number;
  /** Current page size */
  pageSize: number;
  /** Total number of rows */
  totalRows: number;
  /** Can navigate to previous page */
  canPreviousPage: boolean;
  /** Can navigate to next page */
  canNextPage: boolean;
  /** Go to previous page */
  previousPage: () => void;
  /** Go to next page */
  nextPage: () => void;
  /** Set page size */
  setPageSize: (size: number) => void;
  /** Additional CSS classes */
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * GridFooter displays pagination controls and row count info.
 *
 * Design:
 * - Height: 48px
 * - Border: border-t border-border/40
 * - Typography: text-sm text-muted-foreground
 * - Layout: compact with gap-4
 * - Buttons: variant="ghost" size="sm" with ChevronLeft/ChevronRight (strokeWidth={1.5})
 *
 * @example
 * <GridFooter
 *   pageIndex={0}
 *   pageCount={10}
 *   pageSize={25}
 *   totalRows={250}
 *   canPreviousPage={false}
 *   canNextPage={true}
 *   previousPage={() => {}}
 *   nextPage={() => {}}
 *   setPageSize={(size) => {}}
 * />
 */
export function GridFooter({
  pageIndex,
  pageCount,
  pageSize,
  totalRows,
  canPreviousPage,
  canNextPage,
  previousPage,
  nextPage,
  setPageSize,
  className,
}: GridFooterProps) {
  const startRow = pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-t border-border/40 px-4',
        className
      )}
      style={{ height: '48px' }}
    >
      {/* Left: Row count info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Showing {startRow}-{endRow} of {totalRows} results
        </span>
      </div>

      {/* Right: Pagination controls */}
      <div className="flex items-center gap-4">
        {/* Page info */}
        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1} of {pageCount}
        </span>

        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={previousPage}
            disabled={!canPreviousPage}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextPage}
            disabled={!canNextPage}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
