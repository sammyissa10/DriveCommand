import React from 'react'
import { Text, View } from 'react-native'
import { Button } from './Button'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: { label: string; onPress: () => void }
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="mb-4 opacity-50">{icon}</View>
      <Text className="text-white text-xl font-semibold text-center mb-2">{title}</Text>
      {subtitle && (
        <Text className="text-slate-400 text-base text-center mb-6">{subtitle}</Text>
      )}
      {action && (
        <Button title={action.label} onPress={action.onPress} variant="primary" />
      )}
    </View>
  )
}
