import React from 'react'
import { Pressable as RNPressable, type PressableProps as RNPressableProps } from 'react-native'
import { haptic } from '@/lib/haptics'
import { PRESSED_OPACITY } from './tokens'

type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'none'

export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  /** Haptic fired on press. Defaults to a light tap; pass 'none' to silence. */
  haptic?: HapticKind
  className?: string
  children?: React.ReactNode
}

/**
 * The one tappable primitive for the design system: pressed opacity 0.75, a
 * light haptic by default, and an accessibilityLabel prop that callers should
 * always set on icon-only controls. Every interactive surface in the kit is
 * built on this so behaviour is uniform by construction.
 */
export function Pressable({
  haptic: kind = 'light',
  onPress,
  disabled,
  className,
  children,
  ...rest
}: PressableProps) {
  return (
    <RNPressable
      disabled={disabled}
      onPress={(e) => {
        if (kind !== 'none') haptic[kind]()
        onPress?.(e)
      }}
      className={className}
      style={({ pressed }) => ({ opacity: pressed && !disabled ? PRESSED_OPACITY : 1 })}
      {...rest}
    >
      {children}
    </RNPressable>
  )
}
