import React from 'react'
import { Pressable, Text, View } from 'react-native'

export interface SyncStatusBarProps {
  pendingCount: number
  isSyncing: boolean
  isOnline: boolean
  failedCount: number
  onRetryFailed?: () => void
}

/**
 * Thin bar (height 32px) rendered below screen headers when sync state is
 * not "online + all synced". Hidden entirely when everything is clear.
 *
 * States (checked in priority order):
 *   syncing  — blue  — "Syncing N updates..."
 *   failed   — red   — "N updates failed — Tap to retry"  (tappable)
 *   offline  — amber — "Offline — N updates pending"
 *   all clear — null (no render)
 */
export function SyncStatusBar({
  pendingCount,
  isSyncing,
  isOnline,
  failedCount,
  onRetryFailed,
}: SyncStatusBarProps) {
  // All clear — nothing to show
  if (isOnline && !isSyncing && pendingCount === 0 && failedCount === 0) {
    return null
  }

  if (isSyncing) {
    return (
      <View
        className="bg-sky-700 flex-row items-center justify-center"
        style={{ height: 32 }}
        accessibilityRole="status"
        accessibilityLabel={`Syncing ${pendingCount} updates`}
      >
        <Text className="text-white text-xs font-semibold">
          Syncing {pendingCount} {pendingCount === 1 ? 'update' : 'updates'}...
        </Text>
      </View>
    )
  }

  if (failedCount > 0) {
    return (
      <Pressable
        onPress={onRetryFailed}
        className="bg-red-700 active:bg-red-800 flex-row items-center justify-center"
        style={{ height: 32 }}
        accessibilityRole="button"
        accessibilityLabel={`${failedCount} updates failed, tap to retry`}
      >
        <Text className="text-white text-xs font-semibold">
          {failedCount} {failedCount === 1 ? 'update' : 'updates'} failed — Tap to retry
        </Text>
      </Pressable>
    )
  }

  // Offline with pending mutations
  if (!isOnline && pendingCount > 0) {
    return (
      <View
        className="bg-amber-600 flex-row items-center justify-center"
        style={{ height: 32 }}
        accessibilityRole="status"
        accessibilityLabel={`Offline, ${pendingCount} updates pending`}
      >
        <Text className="text-white text-xs font-semibold">
          Offline — {pendingCount} {pendingCount === 1 ? 'update' : 'updates'} pending
        </Text>
      </View>
    )
  }

  return null
}
