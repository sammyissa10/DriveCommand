import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useThemeColors } from '../../constants/tokens'

interface LoadingSpinnerProps {
  fullScreen?: boolean
  size?: 'small' | 'large'
  color?: string
}

export function LoadingSpinner({
  fullScreen = false,
  size = 'large',
  color,
}: LoadingSpinnerProps) {
  const c = useThemeColors()
  const spinnerColor = color ?? c.brand

  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: c.background }}>
        <ActivityIndicator size={size} color={spinnerColor} />
      </View>
    )
  }

  return (
    <View className="items-center justify-center p-4">
      <ActivityIndicator size={size} color={spinnerColor} />
    </View>
  )
}
