import React from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../constants/tokens'

interface SectionHeaderProps {
  title: string
  action?: {
    label: string
    onPress: () => void
  }
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {Platform.OS === 'ios' ? title.toUpperCase() : title}
      </Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.select({ ios: 24, android: 20 }) as number,
    paddingBottom: 8,
    paddingHorizontal: spacing.lg,
  },
  title: Platform.select({
    ios: {
      ...typography.footnote,
      color: colors.textTertiary,
      letterSpacing: 0.5,
    },
    android: {
      ...typography.caption1,
      fontWeight: '500' as const,
      color: colors.textSecondary,
    },
  }) as object,
  action: {
    ...typography.footnote,
    color: colors.brand,
  },
})
