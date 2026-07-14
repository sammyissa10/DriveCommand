import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'

export interface SegmentOption<T extends string> {
  label: string
  value: T
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}

/**
 * Native-iOS segmented control: track = card fill, selected thumb = elevated
 * fill (radius 11/9). Used for list filters and detail tabs. Switches are
 * instant — no thumb animation, per the global QA rule.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View className="flex-row rounded-[11px] bg-ds-card p-1">
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
            className={`h-9 flex-1 items-center justify-center rounded-[9px] ${
              selected ? 'bg-ds-elevated' : ''
            }`}
          >
            <Text
              variant="caption"
              className={`text-[13px] ${selected ? 'font-semibold text-ds-txt' : 'text-ds-txt2'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
