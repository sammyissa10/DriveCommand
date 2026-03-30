import React from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native'
import { colors, radii, typography } from '../../constants/tokens'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
}

/** Ripple color per variant — subtle light ripple on dark buttons */
const variantRipple: Record<string, string> = {
  primary: 'rgba(255,255,255,0.2)',
  secondary: 'rgba(255,255,255,0.1)',
  destructive: 'rgba(255,255,255,0.15)',
  ghost: 'rgba(255,255,255,0.08)',
}

const variantContainerStyle: Record<string, ViewStyle> = {
  primary:     { backgroundColor: colors.brand, borderWidth: 1, borderColor: colors.brand },
  secondary:   { backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border },
  destructive: { backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.danger },
  ghost:       { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
}

const variantLabelStyle: Record<string, TextStyle> = {
  primary:     { color: colors.textPrimary },
  secondary:   { color: colors.textPrimary },
  destructive: { color: colors.textPrimary },
  ghost:       { color: colors.textSecondary },
}

const sizeContainerStyle: Record<string, ViewStyle> = {
  sm: { height: 40, paddingHorizontal: 12 },
  md: { height: 48, paddingHorizontal: 16 },
  lg: { height: 56, paddingHorizontal: 24 },
}

const sizeLabelStyle: Record<string, TextStyle> = {
  sm: { fontSize: typography.subhead.fontSize, lineHeight: typography.subhead.lineHeight, fontWeight: '600' },
  md: { fontSize: typography.body.fontSize,    lineHeight: typography.body.lineHeight,    fontWeight: '600' },
  lg: { fontSize: typography.callout.fontSize, lineHeight: typography.callout.lineHeight, fontWeight: '600' },
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || isLoading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      android_ripple={
        Platform.OS === 'android'
          ? { color: variantRipple[variant], borderless: false }
          : undefined
      }
      style={({ pressed }) => [
        styles.base,
        variantContainerStyle[variant],
        sizeContainerStyle[size],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.textPrimary} size="small" />
      ) : (
        <>
          {icon && <View style={styles.iconWrapper}>{icon}</View>}
          <Text style={[styles.labelBase, variantLabelStyle[variant], sizeLabelStyle[size]]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  labelBase: {
    fontWeight: '600',
  },
  iconWrapper: {
    marginRight: 8,
  },
})
