/**
 * BulkActionsBar Component (Responsive)
 *
 * Responsive bulk actions bar that appears when rows are selected.
 * Desktop: slides down below toolbar. Mobile: fixed to bottom.
 */

'use client';

import { X, Trash2, Download, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { cn } from '@/lib/utils';

export interface BulkAction {
  /** Unique identifier */
  id: string;
  /** Action label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Click handler */
  onClick: () => void;
  /** Whether action is destructive */
  destructive?: boolean;
}

export interface BulkActionsBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Bulk actions array */
  actions?: BulkAction[];
  /** Clear selection handler */
  onClearSelection?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BulkActionsBar displays action controls when rows are selected.
 *
 * Design:
 * - Desktop (>=768px): Slides down below toolbar, position relative, bg-muted/50, height 48px
 * - Mobile (<768px): Fixed to bottom, full width, bg-background border-t shadow-lg
 * - Transition: slide in/out with motion-safe
 * - Visible when selectedCount > 0
 * - ARIA: role="toolbar", aria-label="Bulk actions"
 * - All icons: strokeWidth={1.5}
 *
 * @example
 * <BulkActionsBar
 *   selectedCount={5}
 *   actions={[
 *     { id: 'export', label: 'Export', icon: Download, onClick: () => {} },
 *     { id: 'delete', label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
 *   ]}
 *   onClearSelection={() => {}}
 * />
 */
export function BulkActionsBar({
  selectedCount,
  actions,
  onClearSelection,
  className,
}: BulkActionsBarProps) {
  const { isMobile } = useBreakpoint();

  // Default actions if none provided
  const defaultActions: BulkAction[] = [
    {
      id: 'export',
      label: 'Export',
      icon: Download,
      onClick: () => console.log('Export selected'),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => console.log('Delete selected'),
      destructive: true,
    },
  ];

  const finalActions = actions || defaultActions;

  if (selectedCount === 0) return null;

  // Mobile layout (fixed to bottom)
  if (isMobile) {
    return (
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40',
          'flex flex-col items-center gap-3 border-t border-border bg-background p-4 shadow-lg',
          'motion-safe:transition-transform motion-safe:duration-200',
          className
        )}
        role="toolbar"
        aria-label="Bulk actions"
      >
        {/* Selection count */}
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {selectedCount} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex w-full items-center justify-center gap-2">
          {finalActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant={action.destructive ? 'destructive' : 'outline'}
                size="sm"
                onClick={action.onClick}
                className="flex-1"
              >
                <Icon className="mr-2 h-4 w-4" strokeWidth={1.5} />
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop layout (slides down from toolbar)
  return (
    <div
      className={cn(
        'relative flex h-12 items-center justify-between gap-4 border-y border-border/40 bg-muted/50 px-4',
        'motion-safe:transition-all motion-safe:duration-200',
        className
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      {/* Left: Selection count */}
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>

      {/* Center: Action buttons */}
      <div className="flex items-center gap-2">
        {finalActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.id}
              variant="ghost"
              size="sm"
              onClick={action.onClick}
              className={cn(action.destructive && 'text-destructive hover:text-destructive')}
            >
              <Icon className="mr-2 h-4 w-4" strokeWidth={1.5} />
              {action.label}
            </Button>
          );
        })}
      </div>

      {/* Right: Clear selection */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-8 w-8 p-0"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
