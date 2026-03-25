import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { apiClient } from '@drivecommand/api-client'

/**
 * Register the device's Expo push token with the DriveCommand backend.
 *
 * Called after successful login (non-blocking — never throws).
 * If the user denies notification permission, this silently returns.
 */
export async function registerPushToken(authToken: string): Promise<void> {
  // Skip push token registration in development — requires Firebase (google-services.json)
  // which is not available in local dev builds
  if (__DEV__) return

  try {
    // Request permission — if already granted this resolves immediately
    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return

    // Get Expo push token
    // projectId is read from app.json → expo.extra.eas.projectId at runtime.
    // During development (without EAS build), this may return a simulator token.
    const tokenData = await Notifications.getExpoPushTokenAsync()

    const platform = Platform.OS as 'ios' | 'android'

    // Register with backend — fire-and-forget, errors are non-fatal
    await apiClient.registerPushToken(authToken, tokenData.data, platform)
  } catch (err) {
    // Never crash the login flow — push token registration is best-effort
    console.warn('[registerPushToken] failed (non-fatal):', err)
  }
}
