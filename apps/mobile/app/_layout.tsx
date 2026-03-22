import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts, Poppins_600SemiBold } from '@expo-google-fonts/poppins'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import '../global.css'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

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
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  )
}
