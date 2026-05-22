/**
 * MobileBulkActionsBar Component — iOS HIG Compliant
 *
 * Fixed bottom bar for bulk actions during multi-select mode.
 * - Ink background (#141619), white text
 * - Safe area bottom padding
 * - Shows "{n} selected" + Clear + action buttons
 * - Spring animation on appear
 */

'use client';

import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BulkAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  destructive?: boolean;
}

export interface MobileBulkActionsBarProps {
  selectedCount: number;
  actions?: BulkAction[];
  onClearSelection?: () => void;
  className?: string;
}

/**
 * MobileBulkActionsBar provides bulk action controls during multi-select.
 *
 * Design (iOS HIG + DriveCommand Brand):
 * - Position: fixed bottom, full width
 * - Background: Ink #141619
 * - Text: white
 * - Safe area: padding-bottom for home indicator
 * - Content: "{n} selected" + Clear (X) + action buttons
 * - Animation: slide up with spring
 */
export function MobileBulkActionsBar({
  selectedCount,
  actions = [],
  onClearSelection,
  className,
}: MobileBulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40',
        // Animation
        'motion-safe:animate-in motion-safe:slide-in-from-bottom',
        'motion-safe:duration-200',
        className
      )}
      style={{
        // Background: Ink
        backgroundColor: 'var(--grid-ink, #141619)',
        // Safe area padding
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Selection count */}
        <div className="flex items-center gap-3">
          <span
            className="text-base font-medium text-white"
            style={{ fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)" }}
          >
            {selectedCount} selected
          </span>

          {/* Clear selection */}
          <button
            type="button"
            onClick={onClearSelection}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
              'bg-white/10 hover:bg-white/20',
              'transition-colors'
            )}
          >
            <X className="h-4 w-4 text-white" strokeWidth={1.6} />
            <span
              className="text-sm text-white"
              style={{ fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)" }}
            >
              Clear
            </span>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                onClick={action.onClick}
                className={cn(
                  'h-10 px-4',
                  action.destructive
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                )}
              >
                <Icon className="h-4 w-4 mr-2" strokeWidth={1.6} />
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
