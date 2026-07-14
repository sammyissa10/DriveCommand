import React from 'react'
import { Text } from './Text'
import { Pressable } from './Pressable'

export interface PrimaryButtonProps {
  label: string
  onPress: () => void
  /** Disabled = 35% opacity. Exactly one primary button per sheet. */
  disabled?: boolean
  loading?: boolean
}

/** Full-width accent button, 50 high, radius 15. Disabled = 35% opacity. */
export function PrimaryButton({ label, onPress, disabled = false, loading = false }: PrimaryButtonProps) {
  const off = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      className={`h-[50px] items-center justify-center rounded-[15px] bg-ds-accent ${
        off ? 'opacity-35' : ''
      }`}
    >
      <Text variant="rowTitle" className="text-white">
        {label}
      </Text>
    </Pressable>
  )
}
