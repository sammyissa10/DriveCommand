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
  const userMeta = user.user_metadata || {}
  // role, tenantId, and permissions are stored in app_metadata (admin-only, tamper-proof)
  const appMeta = user.app_metadata || {}
  return {
    id: user.id,
    email: user.email!,
    name: [userMeta.firstName, userMeta.lastName].filter(Boolean).join(' ') || userMeta.name || userMeta.full_name || user.email!,
    role: (appMeta.role as UserRole) || 'DRIVER',
    tenantId: appMeta.tenantId || '',
    companyName: appMeta.companyName || userMeta.companyName || '',
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Load persisted session from SecureStore on mount + subscribe to auth changes.
  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setUser(toAuthUser(session))
          setToken(session.access_token)
        }
      } catch (error) {
        // Stale/expired refresh token stored in SecureStore — clear it so the
        // user is sent to the login screen instead of crashing the app.
        console.warn('Session recovery failed, clearing stale session:', error)
        try {
          await supabase.auth.signOut()
        } catch {
          // signOut is best-effort — ignore failures here
        }
        setUser(null)
        setToken(null)
        router.replace('/login')
      } finally {
        setIsLoading(false)
      }
    }

    void loadSession()

    // Handles: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
    const unsubscribe = onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        // Edge case: token refresh completed but returned no session — treat as sign-out
        setUser(null)
        setToken(null)
        return
      }
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
