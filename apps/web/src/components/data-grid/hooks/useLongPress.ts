'use client';

/**
 * useLongPress Hook
 *
 * Detects long-press gestures for entering multi-select mode on mobile.
 * Cancels if the user moves their finger >10px during press.
 */

import { useRef, useCallback } from 'react';

interface LongPressConfig {
  /** Callback when long press is detected */
  onLongPress: () => void;
  /** Long press duration in milliseconds (default: 500) */
  delay?: number;
}

interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

const MOVE_THRESHOLD = 10; // pixels

/**
 * Hook to detect long-press gestures on touch devices.
 *
 * @param config - Long press configuration
 * @returns Touch event handlers to attach to the element
 *
 * @example
 * const longPressHandlers = useLongPress({
 *   onLongPress: () => console.log('Long pressed!'),
 *   delay: 500,
 * });
 * return <div {...longPressHandlers}>Press and hold</div>;
 */
export function useLongPress(config: LongPressConfig): LongPressHandlers {
  const { onLongPress, delay = 500 } = config;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggered = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    touchStartPos.current = null;
    isLongPressTriggered.current = false;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Record start position
      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      isLongPressTriggered.current = false;

      // Start long press timer
      timeoutRef.current = setTimeout(() => {
        if (!isLongPressTriggered.current) {
          isLongPressTriggered.current = true;
          onLongPress();
        }
      }, delay);
    },
    [onLongPress, delay]
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPos.current) return;

      const currentPos = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };

      const deltaX = Math.abs(currentPos.x - touchStartPos.current.x);
      const deltaY = Math.abs(currentPos.y - touchStartPos.current.y);

      // Cancel if moved more than threshold
      if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
        clear();
      }
    },
    [clear]
  );

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
  };
}
