import React, { memo } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { ArrowRight, ChevronRight } from 'lucide-react-native'
import { Badge } from '../ui/Badge'
import type { LoadSummary } from '@drivecommand/api-client'
import { useThemeColors } from '../../constants/tokens'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'DISPATCHED':
      return { label: 'Accepted', variant: 'info' }
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return { label: 'En Route', variant: 'warning' }
    case 'DELIVERED':
      return { label: 'Delivered', variant: 'success' }
    case 'INVOICED':
      return { label: 'Invoiced', variant: 'success' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'danger' }
    default:
      return { label: status, variant: 'muted' }
  }
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

interface LoadCardProps {
  load: LoadSummary
  onPress: () => void
}

export const LoadCard = memo(function LoadCard({ load, onPress }: LoadCardProps) {
  const c = useThemeColors()
  const badge = getStatusBadge(load.status)

  return (
    <Pressable
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(255,255,255,0.1)', borderless: false } : undefined}
      className="px-4 active:opacity-80"
      style={{ minHeight: 96, paddingVertical: 14, backgroundColor: c.surfaceCard, borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      {/* Row 1: Load number + Status badge */}
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-base font-bold" style={{ color: c.textPrimary }}>#{load.loadNumber}</Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Row 2: Origin -> Destination */}
      <View className="flex-row items-center mb-1.5">
        <Text className="text-sm flex-1" style={{ color: c.textSecondary }} numberOfLines={1}>
          {load.origin}
        </Text>
        <ArrowRight color={c.textTertiary} size={13} style={{ marginHorizontal: 6, flexShrink: 0 }} />
        <Text className="text-sm flex-1 text-right" style={{ color: c.textSecondary }} numberOfLines={1}>
          {load.destination}
        </Text>
      </View>

      {/* Row 3: Customer name + Created date + chevron */}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs ml-2 flex-shrink-0" style={{ color: c.textTertiary, flex: 1 }} numberOfLines={1}>
          {load.customer.companyName}
        </Text>
        <Text className="text-xs ml-2 flex-shrink-0" style={{ color: c.textTertiary }}>
          {formatDate(load.createdAt)}
        </Text>
        <ChevronRight color={c.textTertiary} size={14} style={{ marginLeft: 6, flexShrink: 0 }} />
      </View>
    </Pressable>
  )
})
