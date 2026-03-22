import type { AuthSession, AuthUser, GPSLocation } from '@drivecommand/types'

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  if (typeof window !== 'undefined') return ''
  return 'http://localhost:3000'
}

// 401 handler — set by the app's auth context so any unauthorized response triggers logout
let unauthorizedHandler: (() => void) | null = null

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options
  const url = `${getBaseUrl()}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...fetchOptions, headers })

  if (res.status === 401) {
    unauthorizedHandler?.()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }

  return res.json()
}

export const apiClient = {
  // Auth
  login: (email: string, password: string) =>
    apiRequest<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) =>
    apiRequest<AuthUser>('/api/auth/me', { token }),

  logout: (token: string) =>
    apiRequest<void>('/api/auth/logout', { method: 'POST', token }),

  // Push tokens
  registerPushToken: (token: string, pushToken: string, platform: 'ios' | 'android') =>
    apiRequest<void>('/api/push-tokens', {
      method: 'POST',
      token,
      body: JSON.stringify({ pushToken, platform }),
    }),

  // GPS
  reportGPS: (token: string, payload: {
    latitude: number
    longitude: number
    speed?: number
    heading?: number
    altitude?: number
    trackingToken: string
  }) =>
    apiRequest<void>('/api/gps/report', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),

  getGPSLocations: (token: string) =>
    apiRequest<GPSLocation[]>('/api/gps/locations', { token }),
}

export type { AuthSession, AuthUser }
