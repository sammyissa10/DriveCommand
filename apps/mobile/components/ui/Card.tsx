import React from 'react'
import { Pressable, View } from 'react-native'
import { useThemeColors, radii, shadows, spacing } from '../../constants/tokens'

interface CardProps {
  children: React.ReactNode
  className?: string
  onPress?: () => void
  elevated?: boolean
}

export function Card({ children, onPress, elevated = false }: CardProps) {
  const c = useThemeColors()

  const baseStyle = {
    backgroundColor: elevated ? c.surfaceElevated : c.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.lg,
    ...(elevated ? (shadows.cardElevated as object) : (shadows.card as object)),
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [baseStyle, pressed && { opacity: 0.8 }]}
        android_ripple={{ color: 'rgba(255,255,255,0.06)', borderless: false }}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={baseStyle}>{children}</View>
}
