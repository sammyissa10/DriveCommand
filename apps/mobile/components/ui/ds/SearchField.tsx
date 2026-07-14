import React from 'react'
import { View, TextInput } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { Icon } from './Icon'
import { Pressable } from './Pressable'
import { icon } from './tokens'

export interface SearchFieldProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}

/** Pill search field (radius 13, card fill) that appears on every Overview. */
export function SearchField({ value, onChangeText, placeholder = 'Search' }: SearchFieldProps) {
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-[13px] bg-ds-card px-3">
      <Icon icon={Search} size={icon.md} className="text-ds-txt3" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        className="h-11 flex-1 text-[16px] text-ds-txt placeholder:text-ds-txt3"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={10}
        >
          <Icon icon={X} size={icon.sm} className="text-ds-txt3" />
        </Pressable>
      ) : null}
    </View>
  )
}
