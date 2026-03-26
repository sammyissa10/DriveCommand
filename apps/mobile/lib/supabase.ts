import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

/**
 * expo-secure-store adapter for Supabase auth session persistence.
 * Stores tokens in the device keychain (iOS Keychain / Android Keystore)
 * instead of plain AsyncStorage.
 *
 * Note: SecureStore values are limited to 2 KB on Android. If you see
 * storage errors, consider chunking large values or using MMKV for the
 * token body and SecureStore only for the encryption key.
 */
const SecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> =>
    SecureStore.getItemAsync(key),

  setItem: (key: string, value: string): Promise<void> =>
    SecureStore.setItemAsync(key, value),

  removeItem: (key: string): Promise<void> =>
    SecureStore.deleteItemAsync(key),
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
