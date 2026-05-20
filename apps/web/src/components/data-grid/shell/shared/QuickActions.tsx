/**
 * QuickActions Component
 *
 * Floating action pill that appears on row hover.
 * Vercel/Apple crisp-minimal aesthetic with refined icons.
 */

'use client';

import { Eye, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface QuickAction {
  /** Unique identifier */
  id: string;
  /** Action label for tooltip */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Click handler */
  onClick: () => void;
  /** Whether action is destructive (triggers confirmation) */
  destructive?: boolean;
  /** Destructive action confirmation text */
  confirmTitle?: string;
  /** Destructive action confirmation description */
  confirmDescription?: string;
  /** Whether action is disabled */
  disabled?: boolean;
  /** Disabled tooltip message */
  disabledTooltip?: string;
}

export interface QuickActionsProps {
  /** Array of actions to display */
  actions?: QuickAction[];
  /** Number of selected rows (for auto-disabling View/Edit) */
  selectedCount?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * QuickActions displays inline action icons (always visible, not hover-revealed).
 *
 * Design:
 * - Container: simple flex layout (no border/shadow/floating pill)
 * - Icons: Eye, Pencil, Trash2 with strokeWidth={1.5}, h-4 w-4
 * - Icon buttons: variant="ghost", size="sm"
 * - Gap between icons: gap-1
 * - Always visible (no opacity transitions)
 * - When selectedCount > 1: View/Edit disabled with tooltip "Select single row"
 * - Delete still works (bulk delete)
 * - Delete triggers confirmation dialog
 * - Tooltips on each action
 * - All button clicks call e.stopPropagation() to prevent row selection
 *
 * @example
 * <QuickActions
 *   selectedCount={2}
 *   actions={[
 *     { id: 'view', label: 'View', icon: Eye, onClick: () => {} },
 *     { id: 'edit', label: 'Edit', icon: Pencil, onClick: () => {} },
 *     { id: 'delete', label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
 *   ]}
 * />
 */
export function QuickActions({ actions, selectedCount = 1, className }: QuickActionsProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<QuickAction | null>(null);

  // Auto-disable View/Edit when multiple rows selected
  const isMultiSelect = selectedCount > 1;

  // Default actions if none provided
  const defaultActions: QuickAction[] = [
    {
      id: 'view',
      label: 'View details',
      icon: Eye,
      onClick: () => console.log('View'),
      disabled: isMultiSelect,
      disabledTooltip: 'Select single row',
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit'),
      disabled: isMultiSelect,
      disabledTooltip: 'Select single row',
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => console.log('Delete'),
      destructive: true,
      confirmTitle: 'Are you sure?',
      confirmDescription: 'This action cannot be undone.',
    },
  ];

  const finalActions = actions || defaultActions;

  const handleAction = (action: QuickAction, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row selection
    if (action.disabled) return;
    if (action.destructive) {
      setDeleteConfirm(action);
    } else {
      action.onClick();
    }
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      deleteConfirm.onClick();
      setDeleteConfirm(null);
    }
  };

  return (
    <TooltipProvider>
      <div
        className={cn('flex items-center gap-1', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {finalActions.map((action) => {
          const Icon = action.icon;
          const tooltipText = action.disabled && action.disabledTooltip
            ? action.disabledTooltip
            : action.label;

          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    action.destructive && !action.disabled && 'hover:text-destructive',
                    action.disabled && 'cursor-not-allowed opacity-40'
                  )}
                  onClick={(e) => handleAction(action, e)}
                  disabled={action.disabled}
                  aria-label={action.label}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.confirmTitle || 'Are you sure?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.confirmDescription || 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
