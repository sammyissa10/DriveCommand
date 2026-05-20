/**
 * useBreakpoint Hook
 *
 * Detects responsive breakpoints for mobile vs desktop layout switching.
 * Threshold: 768px (mobile < 768px, desktop >= 768px)
 */

import { useEffect, useState, useMemo } from 'react';

const MOBILE_BREAKPOINT = 768;

interface BreakpointState {
  isMobile: boolean;
  isDesktop: boolean;
  breakpoint: 'mobile' | 'desktop';
}

/**
 * Hook to detect current breakpoint for responsive rendering.
 *
 * @returns {BreakpointState} Current breakpoint state
 *
 * @example
 * const { isMobile, isDesktop } = useBreakpoint();
 * return isMobile ? <MobileView /> : <DesktopView />;
 */
export function useBreakpoint(): BreakpointState {
  // SSR safety: default to desktop
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return MOBILE_BREAKPOINT;
    return window.innerWidth;
  });

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    // Set initial width
    handleResize();

    // Use matchMedia for performance
    const mediaQuery = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);

    // Modern browsers support addEventListener on MediaQueryList
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleResize);
    } else {
      // Fallback for older browsers
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Memoize for performance
  return useMemo(() => {
    const isMobile = width < MOBILE_BREAKPOINT;
    return {
      isMobile,
      isDesktop: !isMobile,
      breakpoint: isMobile ? 'mobile' : 'desktop',
    };
  }, [width]);
}
