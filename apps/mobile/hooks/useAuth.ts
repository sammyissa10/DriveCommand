import { useState, useEffect, useCallback } from 'react'
import { AppState } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { signIn, signOut, onAuthStateChange } from '../lib/auth'
import { registerPushToken } from './usePushNotifications'
import type { AuthUser, UserRole } from '@drivecommand/types'
import type { Session } from '@supabase/supabase-js'

/** Map a Supabase session → the shared AuthUser shape used throughout the app. */
function toAuthUser(session: Session): AuthUser {
  const { user } = session
  const meta = user.user_metadata || {}
  return {
    id: user.id,
    email: user.email!,
    name: meta.name || meta.full_name || user.email!,
    role: (meta.role as UserRole) || 'DRIVER',
    tenantId: meta.tenantId || '',
    companyName: meta.companyName || '',
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Load persisted session from SecureStore on mount + subscribe to auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(toAuthUser(session))
        setToken(session.access_token)
      }
      setIsLoading(false)
    })

    // Handles: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
    const unsubscribe = onAuthStateChange((event, session) => {
      if (session) {
        setUser(toAuthUser(session))
        setToken(session.access_token)
      } else {
        setUser(null)
        setToken(null)
      }
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return unsubscribe
  }, [])

  // Pause/resume Supabase token auto-refresh with app foreground state.
  // This is the recommended React Native pattern — avoids background network calls.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    })
    return () => sub.remove()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const { session } = await signIn(email, password)
    if (!session) throw new Error('Sign in failed — no session returned')

    const authUser = toAuthUser(session)

    // Register push token after login — non-blocking, best-effort
    void registerPushToken(session.access_token)

    return authUser
  }, [])

  // Typed as () => void to match AuthContextValue — signOut fires async, state
  // clears via the onAuthStateChange SIGNED_OUT handler above.
  const logout = useCallback(() => {
    void signOut()
  }, [])

  return { user, token, isLoading, login, logout }
}
