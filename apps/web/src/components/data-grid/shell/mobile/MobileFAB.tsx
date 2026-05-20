/**
 * MobileFAB Component
 *
 * Floating action button for mobile "New" action.
 * Hides during bulk selection.
 */

'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MobileFABProps {
  /** Click handler */
  onClick?: () => void;
  /** Whether FAB is visible */
  visible?: boolean;
  /** Label for accessibility */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MobileFAB displays a floating action button for creating new items.
 *
 * Design:
 * - Position: fixed bottom-6 right-6
 * - Size: h-14 w-14 rounded-full
 * - Background: bg-primary text-primary-foreground
 * - Shadow: shadow-lg
 * - Icon: Plus with strokeWidth={1.5}
 * - Hidden when bulk selection is active (selectedCount > 0)
 * - Transition: scale-95 on press, motion-safe animation
 *
 * @example
 * <MobileFAB onClick={handleNew} visible={selectedCount === 0} label="Create new item" />
 */
export function MobileFAB({
  onClick,
  visible = true,
  label = 'Create new',
  className,
}: MobileFABProps) {
  if (!visible) return null;

  return (
    <Button
      size="lg"
      onClick={onClick}
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'h-14 w-14 rounded-full shadow-lg',
        'bg-primary text-primary-foreground',
        'motion-safe:transition-transform motion-safe:duration-150',
        'active:scale-95',
        className
      )}
      aria-label={label}
    >
      <Plus className="h-6 w-6" strokeWidth={1.5} />
    </Button>
  );
}
