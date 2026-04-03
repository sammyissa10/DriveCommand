import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import { kvStorage } from './storage'

export type NavAppPreference = 'apple' | 'google' | 'waze'

const NAV_PREF_KEY = 'nav_app_preference'

/**
 * Get the driver's stored navigation app preference.
 * Android always returns 'google' regardless of stored value.
 * iOS defaults to 'apple' if no preference is stored.
 */
export function getNavPreference(): NavAppPreference {
  if (Platform.OS === 'android') return 'google'
  const stored = kvStorage.getString(NAV_PREF_KEY) as NavAppPreference | undefined
  return stored ?? 'apple'
}

/**
 * Set the driver's navigation app preference (iOS only — Android is always Google Maps).
 */
export function setNavPreference(pref: NavAppPreference): void {
  kvStorage.setString(NAV_PREF_KEY, pref)
}

/**
 * Build the deep link URL for the given nav app and destination coordinates.
 * Coordinates are lat/lng in decimal degrees.
 */
export function buildNavUrl(pref: NavAppPreference, lat: number, lng: number): string {
  switch (pref) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    case 'waze':
      return `waze://?ll=${lat},${lng}&navigate=yes`
    case 'apple':
    default:
      return `maps://?daddr=${lat},${lng}`
  }
}

/**
 * Open the driver's preferred navigation app with the given destination.
 *
 * Falls back: Waze -> Apple Maps if Waze not installed; Google app -> Google web URL
 * (Google web URL always works — opens in browser on Android, Safari on iOS).
 *
 * Never throws — all errors are silently caught.
 */
export async function openNavigation(lat: number, lng: number): Promise<void> {
  try {
    const pref = getNavPreference()

    if (pref === 'waze') {
      const wazeUrl = buildNavUrl('waze', lat, lng)
      const canOpen = await Linking.canOpenURL(wazeUrl)
      if (canOpen) {
        await Linking.openURL(wazeUrl)
        return
      }
      // Fallback: Waze not installed on iOS — use Apple Maps
      await Linking.openURL(buildNavUrl('apple', lat, lng))
      return
    }

    // Google (https:// URL) always works — opens in browser if app not installed
    // Apple Maps uses maps:// which is iOS-native
    await Linking.openURL(buildNavUrl(pref, lat, lng))
  } catch {
    // Best-effort: if anything fails, silently ignore
  }
}
