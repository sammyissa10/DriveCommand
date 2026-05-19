'use client';

/**
 * QuickActions - Per-row action buttons.
 *
 * Shows view/edit/delete actions on row hover (desktop) or always visible (touch).
 * Supports custom actions.
 */

import * as React from 'react';
import { Eye, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickAction<TData> {
  /** Action label (used in tooltip) */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Click handler */
  onClick: (row: TData) => void;
  /** Button variant */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuickActionsProps<TData> {
  /** Row data */
  row: TData;
  /** Callback when view is clicked */
  onView?: (row: TData) => void;
  /** Callback when edit is clicked */
  onEdit?: (row: TData) => void;
  /** Callback when delete is clicked (triggers confirmation) */
  onDelete?: (row: TData) => void | Promise<void>;
  /** Custom actions to show before default actions */
  customActions?: QuickAction<TData>[];
  /** Item label for delete confirmation */
  itemLabel?: string;
  /** Additional CSS class */
  className?: string;
  /** Always show actions (for touch devices) */
  alwaysVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickActions<TData>({
  row,
  onView,
  onEdit,
  onDelete,
  customActions = [],
  itemLabel = 'item',
  className,
  alwaysVisible = false,
}: QuickActionsProps<TData>) {
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(row);
      setIsDeleteOpen(false);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <TooltipProvider>
      <div
        role="group"
        aria-label="Row actions"
        className={cn(
          'flex items-center gap-0.5',
          !alwaysVisible && 'opacity-0 group-hover:opacity-100 transition-opacity',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Custom actions */}
        {customActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Button
                  variant={action.variant ?? 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => action.onClick(row)}
                  aria-label={action.label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* View button */}
        {onView && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onView(row)}
                aria-label="View"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View</TooltipContent>
          </Tooltip>
        )}

        {/* Edit button */}
        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(row)}
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        )}

        {/* Delete button */}
        {onDelete && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setIsDeleteOpen(true)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>

            {/* Delete confirmation dialog */}
            <DeleteConfirmDialog
              open={isDeleteOpen}
              onOpenChange={setIsDeleteOpen}
              itemCount={1}
              itemLabel={itemLabel}
              onConfirm={handleDeleteConfirm}
              isLoading={isDeleting}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
