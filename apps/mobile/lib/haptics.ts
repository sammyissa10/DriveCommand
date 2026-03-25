import * as Haptics from 'expo-haptics'

/**
 * Centralized haptic feedback utility.
 * All haptic calls are fire-and-forget — errors are silently ignored
 * (haptics not available on simulator/emulator).
 */
export const haptic = {
  /** Light tap — tab presses, pull-to-refresh, minor interactions */
  light: () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),

  /** Medium impact — significant state changes */
  medium: () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),

  /** Heavy impact — destructive or high-importance actions */
  heavy: () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),

  /** Success notification — upload complete, status updated, message sent */
  success: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),

  /** Error notification — API failure, validation error */
  error: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),

  /** Warning notification — destructive action confirmation (cancel load, etc.) */
  warning: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
}
