import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { DriverRoute } from '@drivecommand/api-client'
import { Badge } from '../ui/Badge'
import { useThemeColors } from '../../constants/tokens'

interface RouteCardProps {
  route: DriverRoute
  onPress: () => void
}

function getRouteStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'IN_PROGRESS':
      return 'info'
    case 'PLANNED':
      return 'warning'
    case 'CANCELLED':
      return 'danger'
    default:
      return 'muted'
  }
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return isoString
  }
}

export function RouteCard({ route, onPress }: RouteCardProps) {
  const c = useThemeColors()
  const truckLabel = route.truck
    ? `${route.truck.year} ${route.truck.make} ${route.truck.model} - ${route.truck.licensePlate}`
    : null

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 mx-4 rounded-xl p-4 active:opacity-70"
      style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
    >
      {/* Header row: "My Route" label + status badge + chevron */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-sky-400">My Route</Text>
          <Badge
            label={formatStatusLabel(route.status)}
            variant={getRouteStatusVariant(route.status)}
          />
        </View>
        <ChevronRight size={18} color={c.textSecondary} />
      </View>

      {/* Route name (if set) */}
      {route.name ? (
        <Text className="text-base font-semibold mb-0.5" style={{ color: c.textPrimary }}>{route.name}</Text>
      ) : null}

      {/* Origin → Destination */}
      <Text className="text-sm mb-1" style={{ color: c.textPrimary }}>
        {route.origin} → {route.destination}
      </Text>

      {/* Scheduled date */}
      {route.scheduledDate ? (
        <Text className="text-xs mb-1" style={{ color: c.textSecondary }}>
          Scheduled: {formatDate(route.scheduledDate)}
        </Text>
      ) : null}

      {/* Truck info */}
      {truckLabel ? (
        <Text className="text-xs" style={{ color: c.textSecondary }}>{truckLabel}</Text>
      ) : null}
    </Pressable>
  )
}
