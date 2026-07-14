import React from 'react'
import { View } from 'react-native'
import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import { Text } from './Text'
import { Icon } from './Icon'
import { Pressable } from './Pressable'
import { icon } from './tokens'

export interface ParentChip {
  key: string
  icon: LucideIcon
  label: string
  onPress: () => void
}

export interface ParentStripProps {
  items: ParentChip[]
}

/**
 * "Belongs to" strip: a section label + tappable chips (40 high, radius 13,
 * card fill, accent entity icon, name, chevron) that navigate UP to parent
 * records. Sits under the identity header and above the tabs. Parents live
 * here only — never as field rows or inline sections.
 */
export function ParentStrip({ items }: ParentStripProps) {
  if (items.length === 0) return null
  return (
    <View>
      <Text variant="sectionLabel" className="px-1 pb-2">
        Belongs to
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="button"
            accessibilityLabel={`Open ${it.label}`}
            className="h-10 flex-row items-center gap-2 rounded-[13px] bg-ds-card px-3"
          >
            <Icon icon={it.icon} size={icon.sm} className="text-ds-accent" />
            <Text variant="body" numberOfLines={1} className="text-[15px]">
              {it.label}
            </Text>
            <Icon icon={ChevronRight} size={icon.sm} className="text-ds-txt3" />
          </Pressable>
        ))}
      </View>
    </View>
  )
}
