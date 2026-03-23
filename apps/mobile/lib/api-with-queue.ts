import NetInfo from '@react-native-community/netinfo'
import { offlineQueue, type PendingMutation } from './offline-queue'

/**
 * Wraps an API call: if the device is offline, enqueues the mutation instead
 * of calling the network. Returns null when queued so callers can show
 * "Saved offline" feedback.
 */
export async function callOrQueue<T>(
  type: PendingMutation['type'],
  endpoint: string,
  method: 'POST' | 'PATCH',
  body: object,
  onlineCall: () => Promise<T>
): Promise<T | null> {
  const state = await NetInfo.fetch()

  if (state.isConnected) {
    return onlineCall()
  } else {
    offlineQueue.enqueue({
      type,
      endpoint,
      method,
      body: JSON.stringify(body),
    })
    return null  // caller handles null = queued offline
  }
}
