/**
 * Raw `ds` palette hex values — mirrors the `ds` namespace in tailwind.config.js.
 *
 * Screens style everything through `bg-ds-*` / `text-ds-*` NativeWind classes.
 * This map exists ONLY for the handful of React Native APIs that take a raw
 * color string and have no className (e.g. `RefreshControl` tint/colors,
 * `StatusBar`). Reach for a class first; use this only when the API forces it.
 */
export const dsColors = {
  bg: '#0B1120',
  card: '#171E2E',
  elevated: '#212A3D',
  input: '#1E2638',
  hairline: '#232C40',
  txt: '#F5F7FA',
  txt2: '#8B93A7',
  txt3: '#5B6478',
  initials: '#DDE3F0',
  accent: '#0A84FF',
  vip: '#FFB340',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  avatar: '#2B3550',
  sheet: '#141B2B',
} as const

export type DSColorKey = keyof typeof dsColors
