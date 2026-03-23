import { useState, useEffect, useCallback, useRef } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { offlineQueue } from '../lib/offline-queue'
import { flushQueue } from '../lib/queue-flusher'
import { kvStorage } from '../lib/storage'

const RESET_FAILED_KEY = 'offline_queue_failed_reset'

export interface OfflineSyncState {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  failedCount: number
  retryFailed: () => void
}

/**
 * Subscribes to NetInfo connectivity changes.
 * When the device comes back online (false → true), automatically calls
 * flushQueue to drain the offline mutation queue.
 *
 * Exposes counts for SyncStatusBar binding and a retryFailed callback
 * that resets 'failed' mutations to 'pending' and triggers a fresh flush.
 */
export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(() => offlineQueue.getPendingCount())
  const [failedCount, setFailedCount] = useState(() => offlineQueue.getFailedCount())

  // Track previous connectivity to detect false → true transitions
  const wasOnline = useRef(true)

  const refreshCounts = useCallback(() => {
    setPendingCount(offlineQueue.getPendingCount())
    setFailedCount(offlineQueue.getFailedCount())
  }, [])

  const doFlush = useCallback(async () => {
    refreshCounts()
    if (offlineQueue.getPendingCount() === 0) return

    setIsSyncing(true)
    try {
      await flushQueue((synced, total) => {
        // Update pending count as items are removed during flush
        setPendingCount(total - synced)
      })
    } finally {
      setIsSyncing(false)
      refreshCounts()
    }
  }, [refreshCounts])

  // Subscribe to network state changes
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true

      setIsOnline(online)

      // Reconnection detected — flush pending mutations
      if (online && !wasOnline.current) {
        doFlush()
      }

      wasOnline.current = online
    })

    // Fetch initial state
    NetInfo.fetch().then((state) => {
      const online = state.isConnected === true
      setIsOnline(online)
      wasOnline.current = online
    })

    return unsubscribe
  }, [doFlush])

  const retryFailed = useCallback(() => {
    // Reset all 'failed' mutations back to 'pending' then re-flush
    const queue = offlineQueue.getAll()
    const hasFailures = queue.some(m => m.status === 'failed')
    if (!hasFailures) return

    // Reset retryCount and status on failed mutations
    const reset = queue.map(m =>
      m.status === 'failed'
        ? { ...m, status: 'pending' as const, retryCount: 0 }
        : m
    )
    kvStorage.setObject('offline_mutation_queue', reset)
    refreshCounts()
    doFlush()
  }, [doFlush, refreshCounts])

  return { isOnline, isSyncing, pendingCount, failedCount, retryFailed }
}
