import { Slot } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts, Poppins_600SemiBold } from '@expo-google-fonts/poppins'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { AuthProvider } from '../context/AuthContext'
import { QueryProvider } from '../context/QueryProvider'
import { setUnauthorizedHandler } from '@drivecommand/api-client'
import { useAuthContext } from '../context/AuthContext'
import Toast from 'react-native-toast-message'
import '../global.css'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

/**
 * Inner layout that has access to AuthContext.
 * Registers the 401 handler so any unauthorized API response logs the user out.
 */
function AuthGuard() {
  const { logout } = useAuthContext()

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  return <Slot />
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-SemiBold': Poppins_600SemiBold,
  })

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

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
