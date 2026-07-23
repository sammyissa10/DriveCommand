'use client';

import { useEffect, useState } from 'react';

const DESKTOP_BREAKPOINT = 1024;

/**
 * SSR-safe desktop breakpoint hook.
 *
 * Returns `undefined` until the component has mounted on the client — this is
 * intentional. Callers (e.g. ResponsiveSwitch) must treat `undefined` as
 * "unknown" and render neither a mobile nor a desktop variant during that
 * window, avoiding both a hydration mismatch and the duplicate-form bug that
 * results from mounting both breakpoint variants simultaneously.
 *
 * Once mounted, tracks `(min-width: 1024px)` via matchMedia to match the
 * existing `lg` Tailwind breakpoint used across the carrier pages.
 */
export function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    const onChange = () => setIsDesktop(mql.matches);
    onChange();

    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
