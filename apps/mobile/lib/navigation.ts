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

export type NavDestination =
  | { lat: number; lng: number; address?: string }
  | { lat?: null; lng?: null; address: string }

/**
 * Build the deep link URL for the given nav app and destination.
 * Prefers lat/lng for accuracy; falls back to address string.
 */
export function buildNavUrl(pref: NavAppPreference, dest: NavDestination): string {
  const useCoords = dest.lat != null && dest.lng != null
  const destination = useCoords ? `${dest.lat},${dest.lng}` : encodeURIComponent(dest.address ?? '')

  switch (pref) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
    case 'waze':
      return useCoords
        ? `waze://?ll=${dest.lat},${dest.lng}&navigate=yes`
        : `waze://?q=${encodeURIComponent(dest.address ?? '')}&navigate=yes`
    case 'apple':
    default:
      return `maps://?daddr=${destination}`
  }
}

/**
 * Open the driver's preferred navigation app with the given destination.
 * Accepts lat/lng coordinates or a plain address string as fallback.
 *
 * Falls back: Waze -> Apple Maps if Waze not installed.
 * Google uses an https:// URL that always works (opens browser if app not installed).
 *
 * Never throws — all errors are silently caught.
 */
export async function openNavigation(dest: NavDestination): Promise<void> {
  try {
    const pref = getNavPreference()

    if (pref === 'waze') {
      const wazeUrl = buildNavUrl('waze', dest)
      const canOpen = await Linking.canOpenURL(wazeUrl)
      if (canOpen) {
        await Linking.openURL(wazeUrl)
        return
      }
      await Linking.openURL(buildNavUrl('apple', dest))
      return
    }

    await Linking.openURL(buildNavUrl(pref, dest))
  } catch {
    // Best-effort: if anything fails, silently ignore
  }
}
