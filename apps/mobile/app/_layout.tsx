import { Slot, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { useFonts, Poppins_600SemiBold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { AuthProvider, useAuthContext } from '../context/AuthContext'
import { QueryProvider } from '../context/QueryProvider'
import { setUnauthorizedHandler, configureApiClient } from '@drivecommand/api-client'
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import Toast from 'react-native-toast-message'
import '../global.css'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !__DEV__,
})

// Configure API URL for mobile — Android emulator uses 10.0.2.2 to reach host machine
configureApiClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000' })

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

/**
 * Inner layout that has access to AuthContext.
 * Registers the 401 handler so any unauthorized API response logs the user out.
 * Also handles deep-linking from notification taps.
 */
function AuthGuard() {
  const { logout } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Handle notification taps — deep-link to the relevant screen
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined
      if (!data) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const push = (path: string) => router.push(path as any)
      if (data.screen === 'messages') push('/(driver)/messages')
      else if (data.screen === 'loads') push('/(driver)/loads')
      else if (data.screen === 'documents') push('/(driver)/documents')
    })
    return () => sub.remove()
  }, [router])

  return <Slot />
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-ExtraBold': Poppins_800ExtraBold,
  })

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    async function checkForOTAUpdate() {
      if (__DEV__) return // skip in development
      try {
        const update = await Updates.checkForUpdateAsync()
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
        }
      } catch (e) {
        // Silently fail — don't block app launch
        console.warn('OTA update check failed:', e)
      }
    }
    checkForOTAUpdate()
  }, [])

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) {
    return null
  }

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <AuthGuard />
        </AuthProvider>
      </QueryProvider>
      <Toast />
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(RootLayout)
