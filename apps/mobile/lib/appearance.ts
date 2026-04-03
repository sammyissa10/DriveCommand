import { colorScheme } from 'nativewind'
import { kvStorage } from './storage'

const APPEARANCE_KEY = 'appearance_preference'
export type AppearanceMode = 'light' | 'dark' | 'system'

/** Read saved preference from MMKV. Defaults to 'dark' (existing behavior). */
export function getSavedAppearance(): AppearanceMode {
  return (kvStorage.getString(APPEARANCE_KEY) as AppearanceMode) ?? 'dark'
}

/** Persist preference to MMKV. */
export function saveAppearance(mode: AppearanceMode) {
  kvStorage.setString(APPEARANCE_KEY, mode)
}

/**
 * Call once at app startup to apply saved preference via NativeWind.
 * Uses the module-level colorScheme object from react-native-css-interop
 * which is safe to call outside of React components.
 */
export function initAppearance() {
  const saved = getSavedAppearance()
  colorScheme.set(saved)
}
