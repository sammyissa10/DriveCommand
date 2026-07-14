/**
 * Numeric design tokens (spacing, radii, sizes) for the DriveCommand mobile
 * design system. Colors live in tailwind.config.js under the `ds` namespace —
 * this file holds ONLY the numeric contract so components never inline a
 * magic number. No hex values here.
 *
 * Source of truth: .planning/mobile-design-system.md
 */

/** The only five spacing values that exist in the app. */
export const space = {
  xs: 8,
  sm: 12, // card gap
  md: 16, // card padding
  lg: 20, // screen margin
  xl: 24, // section spacing
} as const

export const radius = {
  card: 20,
  input: 12,
  fieldInput: 10, // edit-mode field input
  sheet: 24,
  kpi: 18,
  search: 13,
  parentChip: 13,
  pill: 8,
  tag: 6.5,
  segTrack: 11,
  segThumb: 9,
  button: 15,
} as const

export const size = {
  avatarList: 44,
  avatarDetail: 72,
  unitChip: 44,
  rowMin: 92,
  fieldRow: 52,
  fieldInput: 44,
  sheetInput: 46,
  pillHeight: 22,
  kpiHeight: 74,
  buttonHeight: 50,
  touchMin: 48,
  parentChip: 40,
  addButton: 32,
  grabberW: 36,
  grabberH: 5,
} as const

/** Standard lucide icon sizes used across the kit. */
export const icon = {
  sm: 16,
  md: 20,
  lg: 24,
} as const

/** Pressed-state opacity for every tappable surface. */
export const PRESSED_OPACITY = 0.75

/** Disabled-state opacity for primary buttons. */
export const DISABLED_OPACITY = 0.35

/** Skeleton shimmer duration (ms). */
export const SHIMMER_MS = 800
