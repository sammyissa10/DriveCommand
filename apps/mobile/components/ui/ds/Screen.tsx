import React from 'react'
import { View, ScrollView } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

export interface ScreenProps {
  children: React.ReactNode
  /** Wrap children in a ScrollView (keyboard-aware taps handled). */
  scroll?: boolean
  /** Apply the 20px screen margin horizontally. Default true. */
  padded?: boolean
  edges?: Edge[]
  className?: string
}

/**
 * Root of every screen: `ds.bg` background, light status bar, safe-area insets.
 * The 20px screen margin (`px-5`) is applied by default. Lists that need a
 * full-bleed FlashList should pass `padded={false}` and pad rows themselves.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'left', 'right'],
  className,
}: ScreenProps) {
  const pad = padded ? 'px-5' : ''

  return (
    <View className="flex-1 bg-ds-bg">
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerClassName={`grow ${pad} ${className ?? ''}`}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View className={`flex-1 ${pad} ${className ?? ''}`}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  )
}
