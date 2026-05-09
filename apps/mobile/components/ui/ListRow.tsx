import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { colors, listRow, spacing, typography } from '../../constants/tokens'

interface ListRowProps {
  title: string
  subtitle?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
  showChevron?: boolean
  showDivider?: boolean
  onPress?: () => void
  testID?: string
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  showChevron,
  showDivider = true,
  onPress,
  testID,
}: ListRowProps) {
  // Show chevron automatically when there's an onPress, unless explicitly set to false
  const shouldShowChevron = showChevron !== undefined ? showChevron : !!onPress

  const rowContent = (
    <>
      <View style={styles.row}>
        {leading && <View style={styles.leading}>{leading}</View>}
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {trailing && <View style={styles.trailing}>{trailing}</View>}
        {shouldShowChevron && (
          <ChevronRight size={16} color={colors.textMuted} style={styles.chevron} />
        )}
      </View>
      {showDivider && <View style={styles.divider} />}
    </>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      >
        {rowContent}
      </Pressable>
    )
  }

  return (
    <View style={styles.container} testID={testID}>
      {rowContent}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCard,
  },
  pressed: {
    opacity: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: listRow.minHeight,
    paddingHorizontal: listRow.paddingHorizontal,
    paddingVertical: 12,
  },
  leading: {
    marginRight: spacing.md,
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trailing: {
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  chevron: {
    marginLeft: spacing.xs,
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: listRow.dividerInsetLeft,
  },
})
