import React from 'react'
import { ScrollView, useColorScheme, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

interface ScreenWrapperProps {
  children: React.ReactNode
  scrollable?: boolean
  className?: string
}

export function ScreenWrapper({
  children,
  scrollable = false,
  className = '',
}: ScreenWrapperProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'

  const bgClass = isDark ? 'bg-slate-900' : 'bg-white'
  const innerClass = `flex-1 px-4 py-4 ${className}`

  if (scrollable) {
    return (
      <SafeAreaView className={`flex-1 ${bgClass}`}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className={`flex-1 ${bgClass}`}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className={innerClass}>{children}</View>
    </SafeAreaView>
  )
}
