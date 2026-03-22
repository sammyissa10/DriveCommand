import React from 'react'
import { ActivityIndicator, View } from 'react-native'

interface LoadingSpinnerProps {
  fullScreen?: boolean
  size?: 'small' | 'large'
  color?: string
}

export function LoadingSpinner({
  fullScreen = false,
  size = 'large',
  color = '#0ea5e9',
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900">
        <ActivityIndicator size={size} color={color} />
      </View>
    )
  }

  return (
    <View className="items-center justify-center p-4">
      <ActivityIndicator size={size} color={color} />
    </View>
  )
}
