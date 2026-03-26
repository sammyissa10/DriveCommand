import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Sign in with email + password.
 * Returns { user, session } on success; throws on failure.
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/**
 * Sign the current user out and clear the persisted session from SecureStore.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Return the active session, or null if unauthenticated.
 * Reads from the persisted SecureStore cache — no network call.
 */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/**
 * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.).
 * Returns an unsubscribe function — call it in your useEffect cleanup.
 *
 * @example
 * useEffect(() => onAuthStateChange((event, session) => { ... }), [])
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
