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
}

export interface QuickActionsProps {
  /** Array of actions to display */
  actions?: QuickAction[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * QuickActions displays a floating pill with action icons on row hover.
 *
 * Design:
 * - Container: bg-background border border-border shadow-sm rounded-md
 * - Icons: Eye, Pencil, Trash2 with strokeWidth={1.5}
 * - Icon buttons: h-7 w-7, variant="ghost"
 * - Gap between icons: gap-0.5
 * - Transition: opacity-0 group-hover:opacity-100 with motion-safe
 * - Delete triggers confirmation dialog
 * - Tooltips on each action
 *
 * @example
 * <QuickActions
 *   actions={[
 *     { id: 'view', label: 'View', icon: Eye, onClick: () => {} },
 *     { id: 'edit', label: 'Edit', icon: Pencil, onClick: () => {} },
 *     { id: 'delete', label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
 *   ]}
 * />
 */
export function QuickActions({ actions, className }: QuickActionsProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<QuickAction | null>(null);

  // Default actions if none provided
  const defaultActions: QuickAction[] = [
    {
      id: 'view',
      label: 'View details',
      icon: Eye,
      onClick: () => console.log('View'),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => console.log('Edit'),
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

  const handleAction = (action: QuickAction) => {
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
        className={cn(
          'flex items-center gap-0.5 rounded-md border border-border bg-background px-1 py-0.5 shadow-sm',
          'motion-safe:transition-opacity motion-safe:duration-150',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {finalActions.map((action) => {
          const Icon = action.icon;
          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    action.destructive && 'hover:text-destructive'
                  )}
                  onClick={() => handleAction(action)}
                  aria-label={action.label}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{action.label}</p>
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
