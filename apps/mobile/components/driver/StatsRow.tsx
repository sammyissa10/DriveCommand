import React from 'react'
import { StyleSheet, View } from 'react-native'
import { StatChip } from './StatChip'
import { spacing } from '../../constants/tokens'

interface StatsRowProps {
  miles: number | string
  stops: number | string
  hosHours: number | string
}

export function StatsRow({ miles, stops, hosHours }: StatsRowProps) {
  return (
    <View style={styles.row}>
      <StatChip value={miles} label="Miles Today" />
      <StatChip value={stops} label="Stops Done" />
      <StatChip value={hosHours} label="HOS Left" />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
