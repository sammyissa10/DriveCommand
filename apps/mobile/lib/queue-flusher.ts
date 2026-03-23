import { offlineQueue } from './offline-queue'
import { sessionStorage } from './storage'

const BACKOFF = [1000, 2000, 4000]  // ms delays per retry attempt

export async function flushQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<void> {
  const session = sessionStorage.get()
  if (!session) return

  const pending = offlineQueue.getAll().filter(m => m.status === 'pending')
  let synced = 0

  for (const mutation of pending) {
    const delay = BACKOFF[mutation.retryCount] ?? 4000
    if (mutation.retryCount > 0) {
      await new Promise(r => setTimeout(r, delay))
    }

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}${mutation.endpoint}`,
        {
          method: mutation.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`,
          },
          body: mutation.body,
        }
      )

      if (res.ok) {
        offlineQueue.remove(mutation.id)
        synced++
        onProgress?.(synced, pending.length)
      } else if (res.status === 401) {
        // Token expired — stop flushing, trigger logout on next render
        break
      } else {
        offlineQueue.incrementRetry(mutation.id)
        if (mutation.retryCount >= 2) {
          offlineQueue.markFailed(mutation.id)
        }
      }
    } catch {
      // Network error during flush — stop and wait for next reconnect event
      break
    }
  }
}
