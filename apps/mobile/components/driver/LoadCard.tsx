import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { ArrowRight } from 'lucide-react-native'
import { Badge } from '../ui/Badge'
import type { LoadSummary } from '@drivecommand/api-client'

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

export function LoadCard({ load, onPress }: LoadCardProps) {
  const badge = getStatusBadge(load.status)

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-800 border-b border-slate-700 px-4 py-4 active:bg-slate-700/80"
      style={{ minHeight: 80 }}
    >
      {/* Row 1: Load number + Status badge */}
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-base font-bold text-white">#{load.loadNumber}</Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Row 2: Origin -> Destination */}
      <View className="flex-row items-center mb-1.5">
        <Text className="text-sm text-slate-300 flex-1" numberOfLines={1}>
          {load.origin}
        </Text>
        <ArrowRight color="#64748b" size={13} style={{ marginHorizontal: 6, flexShrink: 0 }} />
        <Text className="text-sm text-slate-300 flex-1 text-right" numberOfLines={1}>
          {load.destination}
        </Text>
      </View>

      {/* Row 3: Customer name + Created date */}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-slate-500" numberOfLines={1} style={{ flex: 1 }}>
          {load.customer.companyName}
        </Text>
        <Text className="text-xs text-slate-500 ml-2 flex-shrink-0">
          {formatDate(load.createdAt)}
        </Text>
      </View>
    </Pressable>
  )
}
