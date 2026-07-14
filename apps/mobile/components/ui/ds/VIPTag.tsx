import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'

/**
 * VIP tag: 11pt Bold amber text on amber at 15% opacity, radius 6.5. Sits to
 * the right of a name. Never a border, never a filled badge.
 */
export function VIPTag() {
  return (
    <View className="rounded-[6.5px] bg-ds-vip/15 px-1.5 py-0.5 self-start">
      <Text className="text-[11px] font-bold text-ds-vip">VIP</Text>
    </View>
  )
}
