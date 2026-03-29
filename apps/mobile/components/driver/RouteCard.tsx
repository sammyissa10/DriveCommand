import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { DriverRoute } from '@drivecommand/api-client'
import { Badge } from '../ui/Badge'

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
  const truckLabel = route.truck
    ? `${route.truck.year} ${route.truck.make} ${route.truck.model} - ${route.truck.licensePlate}`
    : null

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-800 p-4 active:opacity-70"
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
        <ChevronRight size={18} color="#94a3b8" />
      </View>

      {/* Route name (if set) */}
      {route.name ? (
        <Text className="text-base font-semibold text-white mb-0.5">{route.name}</Text>
      ) : null}

      {/* Origin → Destination */}
      <Text className="text-sm text-white mb-1">
        {route.origin} → {route.destination}
      </Text>

      {/* Scheduled date */}
      {route.scheduledDate ? (
        <Text className="text-xs text-slate-400 mb-1">
          Scheduled: {formatDate(route.scheduledDate)}
        </Text>
      ) : null}

      {/* Truck info */}
      {truckLabel ? (
        <Text className="text-xs text-slate-400">{truckLabel}</Text>
      ) : null}
    </Pressable>
  )
}
