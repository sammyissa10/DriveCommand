"use client"

import { useEffect, useState } from "react"
import type { Transition, Variants } from "framer-motion"

/**
 * Spring configuration for sidebar width transitions
 * Emil Kowalski-style spring physics
 */
export const springConfig: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 35,
}

/**
 * Reduced motion configuration (fallback for prefers-reduced-motion)
 */
export const reducedMotionConfig: Transition = {
  type: "tween",
  duration: 0,
}

/**
 * Framer Motion variants for label fade+slide animation
 * Stagger delay is applied per-item (index * 0.02s = 20ms)
 */
export const labelVariants: Variants = {
  visible: {
    opacity: 1,
    x: 0,
  },
  hidden: {
    opacity: 0,
    x: -8,
  },
}

/**
 * Framer Motion variants for sidebar width
 * Values in pixels (256px = 16rem, 48px = 3rem)
 */
export const sidebarVariants: Variants = {
  expanded: {
    width: 256,
  },
  collapsed: {
    width: 48,
  },
}

/**
 * Hook to detect prefers-reduced-motion and return appropriate config
 * Returns reducedMotionConfig if user has reduced motion preference
 */
export function useMotionConfig(): Transition {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return prefersReducedMotion ? reducedMotionConfig : springConfig
}
