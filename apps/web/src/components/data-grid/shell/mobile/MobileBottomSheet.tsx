/**
 * MobileBottomSheet Component — iOS Action Sheet Style
 *
 * Base bottom sheet component following iOS HIG:
 * - Rounded top corners (20px)
 * - Drag handle indicator
 * - Backdrop blur
 * - Spring animation
 * - Safe area padding
 */

'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * MobileBottomSheet provides an iOS-style action sheet.
 *
 * Design (iOS HIG):
 * - Position: fixed bottom, full width
 * - Top corners: rounded-t-[20px]
 * - Drag handle: 36x4px pill, centered
 * - Backdrop: blur-sm + semi-transparent
 * - Animation: slide up with spring easing
 * - Safe area: pb-safe-area-inset-bottom
 */
export function MobileBottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50',
          'bg-black/40 backdrop-blur-sm',
          'motion-safe:animate-in motion-safe:fade-in-0',
          'motion-safe:duration-200'
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Bottom sheet'}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50',
          'max-h-[85vh]',
          'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
          'rounded-t-[20px]',
          'shadow-2xl',
          // Animation
          'motion-safe:animate-in motion-safe:slide-in-from-bottom',
          'motion-safe:duration-300',
          className
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className="h-1 w-9 rounded-full"
            style={{ backgroundColor: 'var(--grid-n200, #D0D1D7)' }}
          />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--grid-border-header)]">
            <h2
              className="text-lg font-semibold"
              style={{
                color: 'var(--grid-ink, #141619)',
                fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
              }}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center',
                'hover:bg-[var(--grid-hover)] transition-colors'
              )}
              aria-label="Close"
            >
              <X
                className="h-5 w-5"
                style={{ color: 'var(--grid-n500, #6B6E78)' }}
                strokeWidth={1.6}
              />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-auto max-h-[calc(85vh-80px)]">
          {children}
        </div>
      </div>
    </>
  );
}
