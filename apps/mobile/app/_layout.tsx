import { Slot, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { useFonts, Poppins_600SemiBold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect, useRef, useState } from 'react'
import { Animated, ImageBackground, StyleSheet, View, Text } from 'react-native'
import { AuthProvider, useAuthContext } from '../context/AuthContext'
import { QueryProvider } from '../context/QueryProvider'
import { setUnauthorizedHandler, configureApiClient } from '@drivecommand/api-client'
import * as Sentry from '@sentry/react-native'
import Toast from 'react-native-toast-message'
import { DCChevronIcon } from '../components/shared/DCLogo'
import { initAppearance } from '../lib/appearance'
import '../global.css'

// Apply saved appearance preference before first render
initAppearance()

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

// Custom JS splash — full-screen road background with branding.
// Shows while fonts load and fades out once the app is ready.
function CustomSplash({ ready }: { ready: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (ready) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 700,
        delay: 300,
        useNativeDriver: true,
      }).start(() => setHidden(true))
    }
  }, [ready])

  if (hidden) return null

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 999 }]}>
      <ImageBackground
        source={require('../assets/images/login-bg.jpeg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {/* Dark overlay matching the web login screen */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.48)' }]} />

        {/* Centered branding */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <DCChevronIcon size={80} variant="light" />
          <Text style={{ color: '#ffffff', fontSize: 32, fontFamily: ready ? 'Poppins-ExtraBold' : undefined, fontWeight: '900', letterSpacing: -0.5 }}>
            DriveCommand
          </Text>
        </View>
      </ImageBackground>
    </Animated.View>
  )
}

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
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          {fontsLoaded ? <AuthGuard /> : null}
        </AuthProvider>
      </QueryProvider>
      <Toast />
      <CustomSplash ready={fontsLoaded} />
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(RootLayout)
