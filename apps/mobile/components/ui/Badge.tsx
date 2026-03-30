import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radii, typography } from '../../constants/tokens'

interface BadgeProps {
  label: string
  variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'
}

const bgStyles = {
  success: { backgroundColor: colors.successBg },
  warning: { backgroundColor: colors.warningBg },
  danger:  { backgroundColor: colors.dangerBg },
  info:    { backgroundColor: colors.infoBg },
  muted:   { backgroundColor: colors.mutedBg },
} as const

const textStyles = {
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger:  { color: colors.danger },
  info:    { color: colors.info },
  muted:   { color: colors.textTertiary },
} as const

export function Badge({ label, variant }: BadgeProps) {
  return (
    <View style={[styles.base, bgStyles[variant]]}>
      <Text style={[styles.label, textStyles[variant]]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  label: {
    fontSize: typography.caption2.fontSize,
    lineHeight: typography.caption2.lineHeight,
    fontWeight: '500',
  },
})
