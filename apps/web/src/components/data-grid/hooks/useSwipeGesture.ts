/**
 * useSwipeGesture Hook
 *
 * Detects horizontal swipe gestures on touch devices.
 * Used for mobile card swipe-to-reveal actions.
 */

import { useRef, useCallback } from 'react';

interface SwipeGestureConfig {
  /** Callback when swipe left detected */
  onSwipeLeft?: () => void;
  /** Callback when swipe right detected */
  onSwipeRight?: () => void;
  /** Minimum swipe distance in pixels (default: 50) */
  threshold?: number;
}

/**
 * Hook to detect horizontal swipe gestures on touch devices.
 *
 * @param config - Swipe gesture configuration
 * @returns Ref to attach to the swipeable element
 *
 * @example
 * const swipeRef = useSwipeGesture({
 *   onSwipeLeft: () => console.log('Swiped left'),
 *   onSwipeRight: () => console.log('Swiped right'),
 *   threshold: 50,
 * });
 * return <div ref={swipeRef}>Swipe me</div>;
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  config: SwipeGestureConfig
) {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = config;

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const elementRef = useRef<T | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const deltaX = touchEnd.x - touchStart.current.x;
      const deltaY = touchEnd.y - touchStart.current.y;

      // Ensure horizontal swipe (not vertical scroll)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }

      touchStart.current = null;
    },
    [onSwipeLeft, onSwipeRight, threshold]
  );

  const refCallback = useCallback(
    (node: T | null) => {
      // Clean up previous element
      if (elementRef.current) {
        elementRef.current.removeEventListener('touchstart', handleTouchStart);
        elementRef.current.removeEventListener('touchend', handleTouchEnd);
      }

      // Attach to new element
      if (node) {
        node.addEventListener('touchstart', handleTouchStart, { passive: true });
        node.addEventListener('touchend', handleTouchEnd, { passive: true });
      }

      elementRef.current = node;
    },
    [handleTouchStart, handleTouchEnd]
  );

  return refCallback;
}
