/**
 * MobileTableView Component — Professional Mobile Table
 *
 * Best-in-class mobile table view inspired by Airtable/Notion/Google Sheets:
 * - Frozen first column with elevation shadow (appears on horizontal scroll)
 * - Single unified scroll container (header + body scroll together horizontally)
 * - Sticky header on vertical scroll
 * - Edge fade gradient indicating more columns exist
 * - Tap truncated cell to see full value in tooltip
 * - 44px minimum row height (iOS HIG touch target)
 * - JetBrains Mono for data, Inter for headers
 * - Brand tokens, clean hairline dividers
 */

'use client';

import { type Row, type Table } from '@tanstack/react-table';
import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Package, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, getStatusVariant } from '../shared/StatusBadge';

export interface MobileTableViewProps<TData> {
  table: Table<TData>;
  rows: Row<TData>[];
  isLoading?: boolean;
  selectedIds?: Set<string>;
  onRowSelect?: (rowId: string, event: React.MouseEvent) => void;
  onRowDoubleClick?: (row: TData) => void;
  primaryColumn?: string;
  hiddenColumns?: string[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROZEN_WIDTH = 140;
const COLUMN_MIN_WIDTH = 100;
const ROW_HEIGHT = 44; // iOS HIG minimum touch target
const HEADER_HEIGHT = 40;

// ---------------------------------------------------------------------------
// Skeleton Loading State
// ---------------------------------------------------------------------------

function SkeletonTable() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex h-10 border-b border-[var(--grid-border-header)]">
        <div
          className="shrink-0 bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]"
          style={{ width: FROZEN_WIDTH }}
        />
        <div className="flex-1 flex gap-4 px-4 items-center">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-3 w-20 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]"
            />
          ))}
        </div>
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex border-b border-[var(--grid-border-row)]"
          style={{ height: ROW_HEIGHT }}
        >
          <div
            className="shrink-0 px-3 flex items-center"
            style={{ width: FROZEN_WIDTH }}
          >
            <div className="h-4 w-24 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]" />
          </div>
          <div className="flex-1 flex gap-4 px-4 items-center">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-3 w-16 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <Package
        className="h-12 w-12 mb-4"
        style={{ color: 'var(--grid-n400, #8E909A)', opacity: 0.4 }}
        strokeWidth={1.2}
      />
      <p
        className="text-base font-medium"
        style={{
          color: 'var(--grid-n500, #6B6E78)',
          fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
        }}
      >
        No data
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell Value Formatting
// ---------------------------------------------------------------------------

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function isStatusValue(value: unknown, columnId: string): boolean {
  const statusKeywords = ['status', 'state', 'stage'];
  if (statusKeywords.some((k) => columnId.toLowerCase().includes(k))) return true;
  if (typeof value === 'string') {
    const statusPatterns = /^(active|inactive|pending|completed|draft|approved|rejected|cancelled|open|closed|in_progress|new|done|delivered|in_transit|scheduled|at_risk|delayed)$/i;
    return statusPatterns.test(value);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tap-to-Reveal Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  visible: boolean;
  text: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// MobileTableView Component
// ---------------------------------------------------------------------------

export function MobileTableView<TData>({
  table,
  rows,
  isLoading,
  selectedIds,
  onRowSelect,
  onRowDoubleClick,
  primaryColumn,
  hiddenColumns = [],
  className,
}: MobileTableViewProps<TData>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledHorizontally, setHasScrolledHorizontally] = useState(false);
  const [isAtScrollEnd, setIsAtScrollEnd] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, text: '', x: 0, y: 0 });

  // Get visible columns (excluding select, actions, and hidden)
  const columns = useMemo(() => {
    return table
      .getVisibleLeafColumns()
      .filter(
        (col) =>
          col.id !== 'select' &&
          col.id !== 'actions' &&
          !hiddenColumns.includes(col.id)
      );
  }, [table, hiddenColumns]);

  // Frozen column (first or specified primary)
  const frozenColumn = useMemo(() => {
    if (primaryColumn) {
      const col = columns.find((c) => c.id === primaryColumn);
      if (col) return col;
    }
    return columns[0] || null;
  }, [columns, primaryColumn]);

  // Scrollable columns (all except frozen)
  const scrollableColumns = useMemo(() => {
    return columns.filter((col) => col.id !== frozenColumn?.id);
  }, [columns, frozenColumn]);

  // Track horizontal scroll for frozen column shadow and edge fade
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setHasScrolledHorizontally(scrollLeft > 0);
    // Check if scrolled to end (within 2px tolerance)
    setIsAtScrollEnd(scrollLeft + clientWidth >= scrollWidth - 2);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Handle tap on truncated cell to show tooltip
  const handleCellTap = useCallback(
    (e: React.MouseEvent, value: string) => {
      const target = e.currentTarget as HTMLElement;
      const span = target.querySelector('span');
      if (!span) return;

      // Check if content is truncated
      if (span.scrollWidth > span.clientWidth) {
        const rect = target.getBoundingClientRect();
        setTooltip({
          visible: true,
          text: value,
          x: rect.left + rect.width / 2,
          y: rect.top - 8,
        });
      }
    },
    []
  );

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  // Hide tooltip on scroll
  useEffect(() => {
    if (tooltip.visible) {
      const hide = () => hideTooltip();
      window.addEventListener('scroll', hide, { passive: true });
      window.addEventListener('touchstart', hide, { passive: true });
      return () => {
        window.removeEventListener('scroll', hide);
        window.removeEventListener('touchstart', hide);
      };
    }
  }, [tooltip.visible, hideTooltip]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('overflow-hidden', className)}>
        <SkeletonTable />
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState />
      </div>
    );
  }

  const scrollableWidth = scrollableColumns.length * COLUMN_MIN_WIDTH;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Tooltip for truncated content */}
      {tooltip.visible && (
        <div
          className={cn(
            'fixed z-50 max-w-[280px] px-3 py-2 rounded-lg shadow-lg',
            'bg-[var(--grid-ink,#141619)] text-white text-sm',
            'transform -translate-x-1/2 -translate-y-full'
          )}
          style={{
            left: tooltip.x,
            top: tooltip.y,
            fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
          }}
        >
          {tooltip.text}
          <button
            onClick={hideTooltip}
            className="ml-2 inline-flex items-center justify-center"
            aria-label="Close tooltip"
          >
            <X className="h-3 w-3 opacity-60" strokeWidth={1.6} />
          </button>
        </div>
      )}

      {/* Main scroll container - handles both vertical and horizontal scroll */}
      <div
        ref={scrollContainerRef}
        className="overflow-auto"
        style={{
          maxHeight: 'calc(100vh - 240px)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="relative" style={{ minWidth: FROZEN_WIDTH + scrollableWidth }}>
          {/* Frozen column - sticky left */}
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 z-20',
              'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
              // Shadow appears when scrolled horizontally
              'transition-shadow duration-200',
              hasScrolledHorizontally && 'shadow-[4px_0_12px_-4px_rgba(0,0,0,0.15)]'
            )}
            style={{ width: FROZEN_WIDTH }}
          >
            {/* Frozen header cell - sticky top */}
            <div
              className={cn(
                'sticky top-0 z-30 flex items-center px-3',
                'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
                'border-b border-r border-[var(--grid-border-header)]'
              )}
              style={{ height: HEADER_HEIGHT }}
            >
              <span
                className="text-[10px] font-medium uppercase tracking-[0.06em] truncate"
                style={{
                  color: 'var(--grid-n500, #6B6E78)',
                  fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
                }}
              >
                {frozenColumn
                  ? typeof frozenColumn.columnDef.header === 'string'
                    ? frozenColumn.columnDef.header
                    : frozenColumn.id
                  : ''}
              </span>
            </div>

            {/* Frozen data cells */}
            {rows.map((row) => {
              const rowId = row.id;
              const isSelected = selectedIds?.has(rowId) || false;
              const value = frozenColumn ? row.getValue(frozenColumn.id) : null;
              const displayValue = formatCellValue(value);

              return (
                <div
                  key={rowId}
                  className={cn(
                    'flex items-center px-3',
                    'border-b border-r border-[var(--grid-border-row)]',
                    'transition-colors duration-100',
                    isSelected && 'bg-[var(--grid-accent-l50,#E7EAFF)] dark:bg-[var(--grid-accent,#0A21C0)]/10'
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onClick={(e) => onRowSelect?.(rowId, e)}
                >
                  <span
                    className="text-sm font-medium truncate"
                    style={{
                      color: 'var(--grid-ink, #141619)',
                      fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
                    }}
                  >
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable area (header + body) */}
          <div style={{ marginLeft: FROZEN_WIDTH }}>
            {/* Scrollable header - sticky top */}
            <div
              className={cn(
                'sticky top-0 z-10 flex',
                'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
                'border-b border-[var(--grid-border-header)]'
              )}
              style={{ height: HEADER_HEIGHT }}
            >
              {scrollableColumns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center px-3 shrink-0"
                  style={{ width: COLUMN_MIN_WIDTH }}
                >
                  <span
                    className="text-[10px] font-medium uppercase tracking-[0.06em] truncate"
                    style={{
                      color: 'var(--grid-n500, #6B6E78)',
                      fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
                    }}
                  >
                    {typeof column.columnDef.header === 'string'
                      ? column.columnDef.header
                      : column.id}
                  </span>
                </div>
              ))}
            </div>

            {/* Scrollable data rows */}
            {rows.map((row) => {
              const rowId = row.id;
              const isSelected = selectedIds?.has(rowId) || false;

              return (
                <div
                  key={rowId}
                  className={cn(
                    'flex',
                    'border-b border-[var(--grid-border-row)]',
                    'transition-colors duration-100',
                    isSelected && 'bg-[var(--grid-accent-l50,#E7EAFF)] dark:bg-[var(--grid-accent,#0A21C0)]/10'
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onClick={(e) => onRowSelect?.(rowId, e)}
                  onDoubleClick={() => onRowDoubleClick?.(row.original)}
                  role="row"
                  tabIndex={0}
                >
                  {scrollableColumns.map((column) => {
                    const value = row.getValue(column.id);
                    const isStatus = isStatusValue(value, column.id);
                    const displayValue = formatCellValue(value);

                    return (
                      <div
                        key={column.id}
                        className="flex items-center px-3 shrink-0 min-w-0"
                        style={{ width: COLUMN_MIN_WIDTH }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isStatus) {
                            handleCellTap(e, displayValue);
                          }
                        }}
                      >
                        {isStatus ? (
                          <StatusBadge variant={getStatusVariant(String(value))}>
                            {String(value)}
                          </StatusBadge>
                        ) : (
                          <span
                            className="text-xs truncate"
                            style={{
                              color: 'var(--grid-n600, #55575F)',
                              fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
                            }}
                          >
                            {displayValue}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right edge fade gradient - indicates more content to scroll */}
      {!isAtScrollEnd && scrollableColumns.length > 2 && (
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10',
            'bg-gradient-to-l from-[var(--grid-paper,#FFFFFF)] dark:from-[var(--grid-paper,#1A1D23)] to-transparent'
          )}
        />
      )}
    </div>
  );
}
