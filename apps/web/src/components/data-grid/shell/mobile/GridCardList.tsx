/**
 * GridCardList Component (Mobile) — iOS HIG Compliant
 *
 * Virtualized list of cards for mobile view following Apple HIG.
 * - 16px side margins from screen edges
 * - 10px gap between cards
 * - 80px bottom padding for FAB clearance
 * - Skeleton cards matching real card structure
 * - Centered empty state with brand styling
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { Package } from 'lucide-react';
import { GridCard } from './GridCard';
import { cn } from '@/lib/utils';

export interface GridCardListProps<TData> {
  rows: Row<TData>[];
  isLoading?: boolean;
  selectedIds?: Set<string>;
  isMultiSelectMode?: boolean;
  onCardPress?: (row: TData) => void;
  onCardLongPress?: (rowId: string) => void;
  onCardSelect?: (rowId: string) => void;
  onCardEdit?: (row: TData) => void;
  onCardDelete?: (row: TData) => void;
  primaryColumn?: string;
  metadataColumns?: string[];
  statusColumn?: string;
  recordName?: string;
  recordNamePlural?: string;
  className?: string;
}

/**
 * Skeleton card matching the iOS HIG card structure
 */
function SkeletonCard() {
  return (
    <div
      className={cn(
        'rounded-xl p-4',
        'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
        'border border-[var(--grid-n200,#D0D1D7)]/30',
        'dark:border-[var(--grid-n200,#374151)]/30',
        'animate-pulse'
      )}
    >
      {/* Top row: title bar + badge */}
      <div className="flex items-center gap-3">
        <div className="h-5 flex-1 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]" />
        <div className="h-5 w-16 rounded-md bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]" />
        <div className="h-4 w-4 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]" />
      </div>
      {/* Metadata line */}
      <div className="mt-2 h-4 w-2/3 rounded bg-[var(--grid-n100,#E6E7EB)] dark:bg-[var(--grid-n100,#1F2937)]" />
    </div>
  );
}

/**
 * Empty state with brand icon and centered messaging
 */
function EmptyState({ recordNamePlural = 'items' }: { recordNamePlural?: string }) {
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
        No {recordNamePlural} yet
      </p>
    </div>
  );
}

/**
 * GridCardList renders a virtualized list of cards for mobile view.
 *
 * Design (iOS HIG):
 * - Horizontal padding: 16px (mx-4)
 * - Gap between cards: 10px
 * - Bottom padding: 80px (for FAB clearance)
 * - Card height estimate: 76px (title + metadata + padding)
 * - Loading: 4 skeleton cards matching card structure
 * - Empty: centered icon + message
 * - Respects prefers-reduced-motion
 */
export function GridCardList<TData>({
  rows,
  isLoading,
  selectedIds,
  isMultiSelectMode,
  onCardPress,
  onCardLongPress,
  onCardSelect,
  onCardEdit,
  onCardDelete,
  primaryColumn,
  metadataColumns,
  statusColumn,
  recordName = 'Item',
  recordNamePlural,
  className,
}: GridCardListProps<TData>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Card height: 76px content + 10px gap
  const CARD_HEIGHT = 86;
  const GAP = 10;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 5,
  });

  // Derive plural form
  const plural = recordNamePlural || `${recordName}s`;

  // Loading state: 4 skeleton cards
  if (isLoading) {
    return (
      <div className={cn('px-4 py-3 space-y-[10px]', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState recordNamePlural={plural} />
      </div>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{ height: '100%' }}
    >
      {/* Container with padding and relative positioning for virtualizer */}
      <div
        className="px-4 pt-3"
        style={{
          height: `${virtualizer.getTotalSize() + 80}px`, // +80px for FAB clearance
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
                left: 16, // 16px margin
                right: 16, // 16px margin
                height: `${virtualRow.size - GAP}px`, // Subtract gap
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <GridCard
                row={row}
                isSelected={isSelected}
                isMultiSelectMode={isMultiSelectMode}
                onPress={onCardPress ? () => onCardPress(row.original) : undefined}
                onLongPress={onCardLongPress ? () => onCardLongPress(rowId) : undefined}
                onSelect={onCardSelect ? () => onCardSelect(rowId) : undefined}
                onEdit={onCardEdit ? () => onCardEdit(row.original) : undefined}
                onDelete={onCardDelete ? () => onCardDelete(row.original) : undefined}
                primaryColumn={primaryColumn}
                metadataColumns={metadataColumns}
                statusColumn={statusColumn}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
