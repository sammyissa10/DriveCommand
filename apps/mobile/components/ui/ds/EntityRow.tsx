import React from 'react'
import { View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { Text } from './Text'
import { Icon } from './Icon'
import { Pressable } from './Pressable'
import { icon } from './tokens'

export interface EntityRowProps {
  /** MonogramAvatar (people) or UnitChip (vehicles). */
  leading: React.ReactNode
  title: string
  /** e.g. a VIPTag rendered right of the title. */
  titleAccessory?: React.ReactNode
  subline?: string
  meta?: string
  /** A StatusPill. When present the chevron is dropped (whole card taps). */
  pill?: React.ReactNode
  onPress: () => void
  accessibilityLabel?: string
}

/**
 * Standard entity list row — a full card (fill, radius 20, no border). Left
 * avatar/chip, middle 3-line stack, right pill (top) or chevron (centered).
 * Whole card is the tap target with pressed opacity + light haptic.
 */
export function EntityRow({
  leading,
  title,
  titleAccessory,
  subline,
  meta,
  pill,
  onPress,
  accessibilityLabel,
}: EntityRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      className="min-h-[92px] flex-row items-center gap-3 rounded-[20px] bg-ds-card p-4"
    >
      {leading}

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text variant="rowTitle" numberOfLines={1} className="shrink">
            {title}
          </Text>
          {titleAccessory}
        </View>
        {subline ? (
          <Text variant="body" numberOfLines={1} className="mt-0.5 text-[15px] text-ds-txt2">
            {subline}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-ds-txt3">
            {meta}
          </Text>
        ) : null}
      </View>

      {pill ? (
        <View className="self-start pt-0.5">{pill}</View>
      ) : (
        <Icon icon={ChevronRight} size={icon.md} className="text-ds-txt3" />
      )}
    </Pressable>
  )
}
