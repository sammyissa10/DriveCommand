import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, MapPin, Navigation } from 'lucide-react-native'
import { Badge } from '../ui/Badge'
import { colors } from '../../constants/tokens'

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
      style={({ pressed }) => [styles.container, { borderColor: accentColor + '35' }, pressed && styles.pressed]}
    >
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.inner}>
        {/* Label + badge */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label.toUpperCase()}</Text>
          <Badge label={statusBadge.label} variant={statusBadge.variant} />
        </View>

        {/* Title + subtitle on the same row */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        {/* Route */}
        <View style={styles.routeWrap}>
          <View style={styles.routeRow}>
            <MapPin color={colors.success} size={13} style={styles.routeIcon} />
            <Text style={styles.routeText} numberOfLines={1}>{origin}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <Navigation color={accentColor} size={13} style={styles.routeIcon} />
            <Text style={styles.routeText} numberOfLines={1}>{destination}</Text>
          </View>
        </View>

        {/* Link */}
        <View style={styles.linkRow}>
          <Text style={[styles.linkText, { color: linkColor }]}>{linkText}</Text>
          <ChevronRight color={linkColor} size={14} />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
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
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  inner: {
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'nowrap',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  routeWrap: {
    marginTop: 12,
    gap: 0,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeIcon: {
    flexShrink: 0,
  },
  routeLine: {
    width: 1.5,
    height: 10,
    backgroundColor: colors.border,
    marginLeft: 6,
  },
  routeText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 14,
    gap: 2,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
