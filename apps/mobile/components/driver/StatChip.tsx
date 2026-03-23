import React from 'react'
import { Text, View } from 'react-native'

interface StatChipProps {
  value: number | string
  label: string
}

export function StatChip({ value, label }: StatChipProps) {
  return (
    <View className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 items-center">
      <Text className="text-xl font-bold text-white">{value}</Text>
      <Text className="text-xs text-slate-400 mt-0.5 text-center">{label}</Text>
    </View>
  )
}
