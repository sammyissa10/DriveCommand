import { MMKV } from 'react-native-mmkv'
import type { AuthSession } from '@drivecommand/types'

const storage = new MMKV({ id: 'drivecommand-storage' })

/**
 * SECURITY NOTE: Session tokens (access_token, refresh_token) are stored in
 * MMKV's encrypted storage on-device. MMKV uses AES encryption on Android
 * and iOS Keychain-backed encryption. This is acceptable for mobile auth
 * tokens but should NOT store other sensitive PII. Tokens are short-lived
 * (access: 1h, refresh: 7d) and cleared on logout via sessionStorage.clear().
 *
 * Used by: queue-flusher.ts (offline queue auth), gps-task.ts (background GPS reporting)
 */
export const sessionStorage = {
  get: (): AuthSession | null => {
    const raw = storage.getString('session')
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  },
  set: (session: AuthSession) => {
    storage.set('session', JSON.stringify(session))
  },
  clear: () => {
    storage.delete('session')
  },
}

export const kvStorage = {
  getString: (key: string) => storage.getString(key),
  setString: (key: string, value: string) => storage.set(key, value),
  delete: (key: string) => storage.delete(key),
  getObject: <T>(key: string): T | null => {
    const raw = storage.getString(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
  },
  setObject: <T>(key: string, value: T) => storage.set(key, JSON.stringify(value)),
}
