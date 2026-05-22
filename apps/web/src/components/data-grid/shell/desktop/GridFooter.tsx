/**
 * GridFooter Component (Desktop) — DriveCommand Brand
 *
 * Pagination controls for desktop table view.
 * Paper white surface, Inter typography, Signal Blue accents.
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
 * Design (DriveCommand Brand):
 * - Height: 48px
 * - Background: Paper white (#FFFFFF)
 * - Border: border-t N200 at 60%
 * - Typography: Inter, text-sm, N500
 * - Data numbers: JetBrains Mono (row counts, page numbers)
 * - Layout: compact with gap-4
 * - Buttons: ghost, hover bg-accent/[0.04], strokeWidth={1.6}
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
        'flex items-center justify-between gap-4 border-t px-4',
        // Background: Paper white
        'bg-[var(--grid-paper,#FFFFFF)]',
        className
      )}
      style={{
        height: '48px',
        borderColor: 'var(--grid-border-header)',
        fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
      }}
    >
      {/* Left: Row count info */}
      <div
        className="flex items-center gap-1 text-sm"
        style={{ color: 'var(--grid-n500, #6B6E78)' }}
      >
        <span>Showing</span>
        <span
          style={{
            fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {startRow}-{endRow}
        </span>
        <span>of</span>
        <span
          style={{
            fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalRows}
        </span>
        <span>results</span>
      </div>

      {/* Right: Pagination controls */}
      <div className="flex items-center gap-4">
        {/* Page info */}
        <div
          className="flex items-center gap-1 text-sm"
          style={{ color: 'var(--grid-n500, #6B6E78)' }}
        >
          <span>Page</span>
          <span
            style={{
              fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pageIndex + 1}
          </span>
          <span>of</span>
          <span
            style={{
              fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pageCount}
          </span>
        </div>

        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span
            className="text-sm"
            style={{ color: 'var(--grid-n500, #6B6E78)' }}
          >
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger
              className="h-8 w-[70px]"
              style={{
                fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem
                  key={size}
                  value={String(size)}
                  style={{
                    fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
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
            className="bg-transparent hover:bg-[var(--grid-toolbar-hover)]"
            style={{ borderRadius: 'var(--grid-radius-button, 6px)' }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextPage}
            disabled={!canNextPage}
            aria-label="Next page"
            className="bg-transparent hover:bg-[var(--grid-toolbar-hover)]"
            style={{ borderRadius: 'var(--grid-radius-button, 6px)' }}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
          </Button>
        </div>
      </div>
    </div>
  );
}
