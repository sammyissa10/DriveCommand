import { Platform, StyleSheet } from 'react-native'
import { useColorScheme } from 'nativewind'

// Dark palette (original — preserved for backward-compat with inline StyleSheet files)
export const colors = {
  // Surfaces
  background: '#0f172a',
  surfaceCard: '#1e293b',
  surfaceElevated: '#243046',
  surfaceInput: '#1a2538',
  border: '#2d3d53',
  borderLight: '#1e293b',
  divider: '#1e2d42',

  // Brand
  brand: '#0ea5e9',
  brandLight: '#38bdf8',
  brandDark: '#0284c7',
  brandSubtle: '#0c4a6e',

  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textMuted: '#475569',
  textInverse: '#0f172a',

  // Status
  success: '#22c55e',
  successBg: 'rgba(34,197,94,0.12)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.12)',
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.12)',
  info: '#3b82f6',
  infoBg: 'rgba(59,130,246,0.12)',
  mutedBg: 'rgba(100,116,139,0.12)',

  // Tab bar
  tabBarBg: Platform.select({ ios: 'rgba(15,23,42,0.85)', android: '#0c1524' }) as string,
  tabBarBorder: '#1e293b',
  tabActive: '#0ea5e9',
  tabInactive: '#4a5e78',
} as const

// Light palette — used by useThemeColors() in light mode
export const lightColors = {
  // Surfaces
  background: '#ffffff',
  surfaceCard: '#f1f5f9',
  surfaceElevated: '#e2e8f0',
  surfaceInput: '#f8fafc',
  border: '#cbd5e1',
  borderLight: '#e2e8f0',
  divider: '#e2e8f0',

  // Brand (same as dark — works on both backgrounds)
  brand: '#0ea5e9',
  brandLight: '#38bdf8',
  brandDark: '#0284c7',
  brandSubtle: '#e0f2fe',

  // Text
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  textMuted: '#94a3b8',
  textInverse: '#f1f5f9',

  // Status (same as dark — same semantic colors on both themes)
  success: '#22c55e',
  successBg: 'rgba(34,197,94,0.12)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.12)',
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.12)',
  info: '#3b82f6',
  infoBg: 'rgba(59,130,246,0.12)',
  mutedBg: 'rgba(100,116,139,0.12)',

  // Tab bar
  tabBarBg: Platform.select({ ios: 'rgba(255,255,255,0.95)', android: '#ffffff' }) as string,
  tabBarBorder: '#e2e8f0',
  tabActive: '#0ea5e9',
  tabInactive: '#94a3b8',
} as const

/**
 * Reactive color palette hook.
 * Returns the dark palette in dark mode, light palette in light mode.
 * Use this instead of importing `colors` directly in components that need to respond to theme changes.
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme()
  return colorScheme === 'dark' ? colors : lightColors
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

// iOS HIG / Material Design native text scales
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  title1:     { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title2:     { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  title3:     { fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
  headline:   { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: {
    fontSize: Platform.select({ ios: 17, android: 16 }) as number,
    lineHeight: Platform.select({ ios: 22, android: 24 }) as number,
    fontWeight: '400' as const,
  },
  callout:    { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
  subhead:    { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote:   { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption1:   { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  caption2:   { fontSize: 11, lineHeight: 13, fontWeight: '400' as const },
} as const

// Platform-adaptive card shadows
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    android: {
      elevation: 3,
    },
  }) as object,
  cardElevated: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
    android: {
      elevation: 6,
    },
  }) as object,
  tabBar: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -1 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    android: {
      elevation: 8,
    },
  }) as object,
} as const

// Native tab bar dimensions
export const tabBar = {
  height: (Platform.select({ ios: 49, android: 64 }) as number) + (Platform.select({ ios: 34, android: 0 }) as number),
  iconSize: Platform.select({ ios: 26, android: 24 }) as number,
  labelSize: Platform.select({ ios: 10, android: 11 }) as number,
} as const

// Native list row dimensions
export const listRow = {
  minHeight: Platform.select({ ios: 44, android: 48 }) as number,
  paddingHorizontal: 16,
  dividerInsetLeft: 16,
} as const
