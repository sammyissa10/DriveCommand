import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowRight } from 'lucide-react-native'
import { Badge } from '../ui/Badge'
import { colors, radii, spacing, typography } from '../../constants/tokens'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface TripCardProps {
  accentColor: string
  label: string
  title: string
  statusBadge: { label: string; variant: BadgeVariant }
  origin: string
  destination: string
  subtitle?: string
  linkText: string
  linkColor: string
  onPress: () => void
}

export function TripCard({
  accentColor,
  label,
  title,
  statusBadge,
  origin,
  destination,
  subtitle,
  linkText,
  linkColor,
  onPress,
}: TripCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { borderColor: accentColor + '40' },
        pressed && styles.pressed,
      ]}
    >
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.inner}>
        {/* Label row */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Badge label={statusBadge.label} variant={statusBadge.variant} />
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Subtitle (optional) */}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}

        {/* Origin → Destination */}
        <View style={styles.routeRow}>
          <Text style={styles.routeText} numberOfLines={1}>{origin}</Text>
          <ArrowRight color={colors.textTertiary} size={14} style={styles.routeArrow} />
          <Text style={[styles.routeText, styles.routeTextRight]} numberOfLines={1}>{destination}</Text>
        </View>

        {/* Link row */}
        <View style={styles.linkRow}>
          <Text style={[styles.linkText, { color: linkColor }]}>{linkText}</Text>
          <ArrowRight color={linkColor} size={12} />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.8,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
  },
  inner: {
    paddingLeft: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption1,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  routeText: {
    ...typography.subhead,
    color: colors.textSecondary,
    flex: 1,
  },
  routeTextRight: {
    textAlign: 'right',
  },
  routeArrow: {
    marginHorizontal: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
  linkText: {
    ...typography.caption1,
    fontWeight: '500',
    marginRight: spacing.xs,
  },
})
