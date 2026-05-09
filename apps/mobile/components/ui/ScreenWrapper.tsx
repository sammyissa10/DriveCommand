import React from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { useThemeColors, spacing } from '../../constants/tokens'

interface ScreenWrapperProps {
  children: React.ReactNode
  scrollable?: boolean
  className?: string
}

export function ScreenWrapper({
  children,
  scrollable = false,
}: ScreenWrapperProps) {
  const { colorScheme } = useColorScheme()
  const c = useThemeColors()

  if (scrollable) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }}>
        {children}
      </View>
    </SafeAreaView>
  )
}
