import React from 'react'
import { View, Text as RNText } from 'react-native'
import { radius } from './tokens'

export interface UnitChipProps {
  /** The unit number, e.g. "104". */
  number: string
  /** Edge length. 44 in list rows, larger on detail. */
  size?: number
}

/**
 * Rounded-square unit chip for vehicles — machines get squares, people get
 * circles. `ds.avatar` fill, tiny UNIT eyebrow over the number.
 */
export function UnitChip({ number, size = 44 }: UnitChipProps) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius.input }}
      className="items-center justify-center bg-ds-avatar"
    >
      <RNText className="text-[8px] font-semibold uppercase tracking-[0.6px] text-ds-txt3">
        Unit
      </RNText>
      <RNText style={{ fontSize: Math.round(size * 0.34) }} className="font-bold text-ds-initials">
        {number}
      </RNText>
    </View>
  )
}
