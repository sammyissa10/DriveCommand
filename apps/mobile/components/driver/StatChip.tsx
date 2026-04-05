import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../constants/tokens'

interface StatChipProps {
  value: number | string
  label: string
}

export function StatChip({ value, label }: StatChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
  },
})
