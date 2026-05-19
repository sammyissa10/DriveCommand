'use client';

/**
 * BulkActionsBar - Sticky bar that slides in when rows are selected.
 *
 * Shows selection count, custom actions, and delete button.
 */

import * as React from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDataGridContext } from '../core/DataGrid';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkAction {
  /** Action label */
  label: string;
  /** Lucide icon component */
  icon?: LucideIcon;
  /** Click handler - receives array of selected row IDs */
  onClick: (selectedIds: string[]) => void;
  /** Button variant */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BulkActionsBarProps {
  /** Custom bulk actions */
  actions?: BulkAction[];
  /** Callback when delete is triggered */
  onDelete?: (selectedIds: string[]) => void | Promise<void>;
  /** Label for items (used in delete confirmation) */
  itemLabel?: string;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionsBar({
  actions = [],
  onDelete,
  itemLabel = 'item',
  className,
}: BulkActionsBarProps) {
  const { selection } = useDataGridContext();
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const selectedCount = selection.selectedCount;
  const selectedIds = Array.from(selection.selectedIds);
  const isVisible = selectedCount > 0;

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(selectedIds);
      selection.clearSelection();
      setIsDeleteOpen(false);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle action click
  const handleActionClick = (action: BulkAction) => {
    action.onClick(selectedIds);
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className={cn(
          'fixed bottom-0 left-0 right-0 p-3 bg-background border-t border-border shadow-lg z-50',
          'transition-transform duration-200',
          isVisible ? 'translate-y-0' : 'translate-y-full',
          className
        )}
      >
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          {/* Selection count */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>

            {/* Custom actions */}
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={index}
                  variant={action.variant ?? 'outline'}
                  size="sm"
                  onClick={() => handleActionClick(action)}
                >
                  {Icon && <Icon className="h-4 w-4 mr-1" />}
                  {action.label}
                </Button>
              );
            })}

            {/* Delete button */}
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </Button>
            )}
          </div>

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selection.clearSelection()}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear selection
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemCount={selectedCount}
        itemLabel={itemLabel}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </>
  );
}
