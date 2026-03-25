import { kvStorage } from './storage'

export interface PendingMutation {
  id: string
  type: 'UPDATE_LOAD_STATUS' | 'REVERT_LOAD_STATUS' | 'CREATE_HOS_ENTRY' | 'CREATE_INCIDENT'
  endpoint: string
  method: 'POST' | 'PUT' | 'PATCH'
  body: string  // JSON serialized
  timestamp: number
  retryCount: number
  status: 'pending' | 'failed'
}

const QUEUE_KEY = 'offline_mutation_queue'

export const offlineQueue = {
  getAll: (): PendingMutation[] => {
    return kvStorage.getObject<PendingMutation[]>(QUEUE_KEY) ?? []
  },

  enqueue: (mutation: Omit<PendingMutation, 'id' | 'timestamp' | 'retryCount' | 'status'>) => {
    const queue = offlineQueue.getAll()
    const newMutation: PendingMutation = {
      ...mutation,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
    }
    kvStorage.setObject(QUEUE_KEY, [...queue, newMutation])
    return newMutation
  },

  remove: (id: string) => {
    const queue = offlineQueue.getAll()
    kvStorage.setObject(QUEUE_KEY, queue.filter(m => m.id !== id))
  },

  markFailed: (id: string) => {
    const queue = offlineQueue.getAll()
    kvStorage.setObject(QUEUE_KEY, queue.map(m =>
      m.id === id ? { ...m, status: 'failed' as const } : m
    ))
  },

  incrementRetry: (id: string) => {
    const queue = offlineQueue.getAll()
    kvStorage.setObject(QUEUE_KEY, queue.map(m =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m
    ))
  },

  getPendingCount: () => offlineQueue.getAll().filter(m => m.status === 'pending').length,
  getFailedCount: () => offlineQueue.getAll().filter(m => m.status === 'failed').length,
}
