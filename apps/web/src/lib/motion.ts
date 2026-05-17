/**
 * Motion constants for DriveCommand
 * Based on Emil Kowalski design engineering principles
 *
 * Key principles:
 * - Use exponential-out easing for enters/hovers (fast start, soft landing)
 * - Never use linear or ease-in for UI (feels sluggish)
 * - Keep durations short (80-300ms for most UI)
 * - Cap stagger delays to prevent slow animations
 */

// Easing curves — exponential out for UI, never linear or ease-in
export const ease = {
  /** Default for enters, hovers — fast start, soft landing */
  out: [0.16, 1, 0.3, 1] as const,
  /** Rarely used — feels slow */
  in: [0.4, 0, 1, 1] as const,
  /** On-screen movement (e.g., sidebar sliding) */
  inOut: [0.4, 0, 0.2, 1] as const,
  /** Playful bounce — use sparingly */
  spring: [0.34, 1.56, 0.64, 1] as const,
} as const;

// CSS easing strings for Tailwind/CSS transitions
export const easeCss = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// Durations in seconds (for Framer Motion)
export const duration = {
  /** Hover color changes, micro-interactions */
  instant: 0.08,
  /** Button press, tooltips appear */
  fast: 0.15,
  /** Dropdowns, selects, default */
  base: 0.2,
  /** Modals, drawers, larger overlays */
  slow: 0.3,
  /** Marketing animations, page transitions */
  deliberate: 0.5,
} as const;

// Durations in ms (for CSS/setTimeout)
export const durationMs = {
  instant: 80,
  fast: 150,
  base: 200,
  slow: 300,
  deliberate: 500,
} as const;

// Common animation presets (for Framer Motion)
export const presets = {
  /** Simple fade in/out */
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: duration.base, ease: ease.out },
  },
  /** Scale + fade (modals, popovers) */
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: duration.base, ease: ease.out },
  },
  /** Slide up + fade (dropdowns, toasts) */
  slideUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: duration.base, ease: ease.out },
  },
  /** Slide down + fade (menus) */
  slideDown: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: duration.base, ease: ease.out },
  },
  /** Slide from right (drawers, sidebars) */
  slideRight: {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
    transition: { duration: duration.slow, ease: ease.out },
  },
} as const;

/**
 * Stagger helper — caps at 300ms total to prevent slow animations
 * @param index - Item index in the list
 * @param delayPerItem - Delay between each item (default 0.05s = 50ms)
 * @returns Delay in seconds
 */
export function staggerDelay(index: number, delayPerItem = 0.05): number {
  return Math.min(index * delayPerItem, 0.3);
}

/**
 * Get stagger children config for Framer Motion's staggerChildren
 * @param itemCount - Number of items to stagger
 * @param maxDuration - Max total stagger duration (default 0.3s)
 * @returns staggerChildren value in seconds
 */
export function getStaggerChildren(itemCount: number, maxDuration = 0.3): number {
  if (itemCount <= 1) return 0;
  return Math.min(maxDuration / (itemCount - 1), 0.05);
}

// Type exports for consumers
export type EaseType = keyof typeof ease;
export type DurationType = keyof typeof duration;
export type PresetType = keyof typeof presets;
