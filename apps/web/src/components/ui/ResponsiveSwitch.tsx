'use client';

import type { ReactNode } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';

interface ResponsiveSwitchProps {
  /** Rendered when the viewport is below the desktop breakpoint. */
  mobile: ReactNode;
  /** Rendered when the viewport is at or above the desktop breakpoint. */
  desktop: ReactNode;
  /** Rendered pre-mount, before the breakpoint is known. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Mounts exactly ONE of {mobile, desktop} at a time.
 *
 * The mobile-web design-system pattern historically rendered both breakpoint
 * variants simultaneously, toggled with CSS (`lg:hidden` / `hidden lg:block`).
 * That leaves two independent `<form>` trees (and their state) live in the
 * DOM at once, causing duplicate submit buttons/fields and submit clicks
 * binding to the wrong copy.
 *
 * ResponsiveSwitch instead waits for `useIsDesktop()` to resolve past its
 * `undefined` (pre-mount) state and then renders a single variant — never
 * both, and never a hydration-mismatched guess.
 */
export function ResponsiveSwitch({ mobile, desktop, fallback = null }: ResponsiveSwitchProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop === undefined) {
    return <>{fallback}</>;
  }

  return <>{isDesktop ? desktop : mobile}</>;
}
