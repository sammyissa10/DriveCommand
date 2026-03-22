import { useState, useEffect, useCallback } from 'react'
import { AppState } from 'react-native'
import { useRouter } from 'expo-router'
import { apiClient } from '@drivecommand/api-client'
import { sessionStorage } from '../lib/storage'
import type { AuthUser } from '@drivecommand/types'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Load session on mount
  useEffect(() => {
    const session = sessionStorage.get()
    if (session) {
      setToken(session.token)
      setUser(session.user)
    }
    setIsLoading(false)
  }, [])

  // Validate token when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && token) {
        try {
          const freshUser = await apiClient.me(token)
          setUser(freshUser)
        } catch {
          // Token invalid or expired — logout
          logout()
        }
      }
    })
    return () => sub.remove()
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiClient.login(email, password)
    sessionStorage.set(session)
    setToken(session.token)
    setUser(session.user)
    return session.user
  }, [])

  const logout = useCallback(() => {
    sessionStorage.clear()
    setToken(null)
    setUser(null)
    router.replace('/login')
  }, [router])

  return { user, token, isLoading, login, logout }
}
