import { Redirect } from 'expo-router'
import { useAuthContext } from '../context/AuthContext'

/**
 * Entry point — redirects based on auth state:
 *   - Loading → renders nothing (splash remains visible)
 *   - No session → /login
 *   - OWNER role → /(owner)
 *   - DRIVER role → /(driver)
 */
export default function Index() {
  const { user, isLoading } = useAuthContext()

  if (isLoading) return null
  if (!user) return <Redirect href="/login" />
  if (user.role === 'OWNER') return <Redirect href="/(owner)" />
  return <Redirect href="/(driver)" />
}
