/**
 * MobileFAB Component — iOS HIG Compliant
 *
 * Floating action button for mobile "New" action.
 * - 56px circle, Signal Blue background, white +
 * - Fixed bottom-right, positioned ABOVE the bottom nav bar (60px + safe-area + 24px gap)
 * - Hidden during multi-select mode
 * - Haptic feedback on press
 */

'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileFABProps {
  /** Click handler */
  onClick?: () => void;
  /** Whether FAB is visible */
  visible?: boolean;
  /** Label for accessibility and tooltip */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MobileFAB displays a floating action button for creating new items.
 *
 * Design (iOS HIG + DriveCommand Brand):
 * - Position: fixed, bottom-right, ABOVE the 60px bottom nav bar
 * - Bottom offset: 60px (nav) + safe-area-inset + 24px gap
 * - Size: 56x56px (14rem), rounded-full
 * - Background: Signal Blue #0A21C0
 * - Icon: white Plus, strokeWidth 1.6
 * - Shadow: shadow-lg for elevation
 * - Press: scale-95 + haptic
 * - Hidden when bulk selection is active
 * - Respects prefers-reduced-motion
 */
export function MobileFAB({
  onClick,
  visible = true,
  label = 'Create new',
  className,
}: MobileFABProps) {
  if (!visible) return null;

  const handleClick = () => {
    // Trigger haptic feedback if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        // Position: fixed with safe area
        'fixed z-50',
        // Size: 56x56px
        'h-14 w-14',
        // Shape: circle
        'rounded-full',
        // Flex center for icon
        'flex items-center justify-center',
        // Shadow
        'shadow-lg',
        // Interaction
        'active:scale-95',
        'motion-safe:transition-transform motion-safe:duration-150',
        // Focus ring
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2',
        className
      )}
      style={{
        // Position: bottom-right, ABOVE the 60px bottom nav bar
        // 60px (nav height) + safe-area-inset + 24px gap
        bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 24px)',
        right: '24px',
        // Background: Signal Blue
        backgroundColor: 'var(--grid-accent, #0A21C0)',
      }}
      aria-label={label}
      title={label}
    >
      <Plus className="h-7 w-7 text-white" strokeWidth={1.6} />
    </button>
  );
}
