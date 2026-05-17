"use client"

import { useEffect, useState } from "react"
import type { Transition, Variants } from "framer-motion"
import {
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_ANIMATION_DURATION,
  SIDEBAR_ANIMATION_EASING,
} from "./sidebar.config"

/**
 * Apple-style smooth curve for sidebar transitions
 * 320ms with cubic-bezier(0.32, 0.72, 0, 1)
 */
export const smoothConfig: Transition = {
  type: "tween",
  duration: SIDEBAR_ANIMATION_DURATION / 1000,
  ease: [0.32, 0.72, 0, 1],
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
 * 240px expanded, 56px collapsed (Apple-style dimensions)
 */
export const sidebarVariants: Variants = {
  expanded: {
    width: SIDEBAR_WIDTH_EXPANDED,
  },
  collapsed: {
    width: SIDEBAR_WIDTH_COLLAPSED,
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

  return prefersReducedMotion ? reducedMotionConfig : smoothConfig
}
