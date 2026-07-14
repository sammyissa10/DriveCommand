import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'

export interface SectionHeaderProps {
  title: string
  /** Optional trailing text action, e.g. "See all". */
  action?: { label: string; onPress: () => void }
}

/** Group header: 12 Semibold UPPERCASE +0.8 tracking, with an optional action. */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-1 pb-2">
      <Text variant="sectionLabel">{title}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={10}
        >
          <Text className="text-[13px] text-ds-accent">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
