import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { colors, radii, shadows, spacing } from '../../constants/tokens'

interface CardProps {
  children: React.ReactNode
  className?: string
  onPress?: () => void
  elevated?: boolean
}

export function Card({ children, className = '', onPress, elevated = false }: CardProps) {
  const cardStyle = [
    styles.base,
    elevated ? styles.elevated : styles.normal,
  ]

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        android_ripple={{ color: 'rgba(255,255,255,0.06)', borderless: false }}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={cardStyle}>{children}</View>
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  normal: {
    ...(shadows.card as object),
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
    ...(shadows.cardElevated as object),
  },
  pressed: {
    opacity: 0.8,
  },
})
