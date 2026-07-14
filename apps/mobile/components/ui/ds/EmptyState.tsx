import React from 'react'
import { View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { Text } from './Text'
import { Icon } from './Icon'

export interface EmptyStateProps {
  icon: LucideIcon
  /** 15pt primary line, e.g. "No clients yet". */
  title: string
  /** 13pt secondary line inviting the add action. */
  message: string
}

/**
 * Centered empty state: muted icon, one 15pt line, one 13pt secondary line
 * pointing at the add action. No illustrations.
 */
export function EmptyState({ icon, title, message }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Icon icon={icon} size={40} className="text-ds-txt3" strokeWidth={1.5} />
      <Text variant="body" className="mt-4 text-center text-[15px]">
        {title}
      </Text>
      <Text variant="caption" className="mt-1 text-center">
        {message}
      </Text>
    </View>
  )
}
