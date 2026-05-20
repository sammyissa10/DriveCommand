/**
 * GridCardList Component (Mobile)
 *
 * Virtualized list of cards for mobile view.
 * Handles empty, loading states.
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { GridCard } from './GridCard';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSkeleton } from '../shared/LoadingSkeleton';

export interface GridCardListProps<TData> {
  rows: Row<TData>[];
  isLoading?: boolean;
  selectedIds?: Set<string>;
  isMultiSelectMode?: boolean;
  onCardPress?: (row: TData) => void;
  onCardLongPress?: (rowId: string) => void;
  onCardSelect?: (rowId: string) => void;
  primaryColumn?: string;
  metadataColumns?: string[];
  statusColumn?: string;
  className?: string;
}

/**
 * GridCardList renders a virtualized list of cards for mobile view.
 *
 * Design:
 * - Virtualized with @tanstack/react-virtual
 * - estimateSize: 100px per card
 * - Padding: px-4 for card list container
 * - Shows EmptyState when rows.length === 0
 * - Shows LoadingSkeleton when loading
 * - Pull-to-refresh support (optional, via onRefresh callback)
 *
 * @example
 * <GridCardList
 *   rows={rows}
 *   isLoading={isLoading}
 *   selectedIds={selectedIds}
 *   onCardPress={(row) => {}}
 *   onCardLongPress={(rowId) => {}}
 *   primaryColumn="name"
 *   metadataColumns={['email', 'createdAt']}
 *   statusColumn="status"
 * />
 */
export function GridCardList<TData>({
  rows,
  isLoading,
  selectedIds,
  isMultiSelectMode,
  onCardPress,
  onCardLongPress,
  onCardSelect,
  primaryColumn,
  metadataColumns,
  statusColumn,
  className,
}: GridCardListProps<TData>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        <LoadingSkeleton rows={5} columns={1} showHeader={false} />
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

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div
        className="px-4 py-2"
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
              <GridCard
                row={row}
                isSelected={isSelected}
                isMultiSelectMode={isMultiSelectMode}
                onPress={onCardPress ? () => onCardPress(row.original) : undefined}
                onLongPress={onCardLongPress ? () => onCardLongPress(rowId) : undefined}
                onSelect={onCardSelect ? () => onCardSelect(rowId) : undefined}
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
