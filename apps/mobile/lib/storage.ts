import { MMKV } from 'react-native-mmkv'
import type { AuthSession } from '@drivecommand/types'

const storage = new MMKV({ id: 'drivecommand-storage' })

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
