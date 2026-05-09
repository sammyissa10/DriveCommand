import React from 'react'
import { Pressable, Text, View } from 'react-native'
import type { DriverRouteLoad } from '@drivecommand/api-client'
import { Badge } from '../ui/Badge'

interface RouteLoadTimelineItemProps {
  load: DriverRouteLoad
  isLast: boolean
  legNumber: number
  onPress: () => void
}

function getLoadDotColor(status: string): string {
  switch (status) {
    case 'DELIVERED':
    case 'INVOICED':
      return '#22c55e' // green-500
    case 'IN_TRANSIT':
      return '#0ea5e9' // sky-500
    default:
      return '#94a3b8' // slate-400
  }
}

function getLoadStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'DELIVERED':
    case 'INVOICED':
      return 'success'
    case 'IN_TRANSIT':
      return 'info'
    case 'PICKED_UP':
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

export function RouteLoadTimelineItem({ load, isLast, legNumber, onPress }: RouteLoadTimelineItemProps) {
  const dotColor = getLoadDotColor(load.status)

  return (
    <Pressable onPress={onPress} className="flex-row active:opacity-70">
      {/* Left column: dot + connector line */}
      <View className="items-center" style={{ width: 24 }}>
        {/* Dot */}
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: dotColor,
            marginTop: 3,
          }}
        />
        {/* Connector line */}
        {!isLast && (
          <View
            style={{
              width: 2,
              flex: 1,
              backgroundColor: '#334155',
              minHeight: 24,
              marginTop: 4,
            }}
          />
        )}
      </View>

      {/* Right column: load details */}
      <View className="flex-1 pb-4 pl-3">
        {/* Leg label */}
        <Text className="text-sm font-bold text-sky-400 mb-0.5">
          Leg {legNumber}
        </Text>
        {/* Load number label */}
        <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
          #{load.loadNumber}
        </Text>

        {/* Origin → Destination */}
        <Text className="text-sm text-white mb-1">
          {load.origin} → {load.destination}
        </Text>

        {/* Status badge */}
        <Badge
          label={formatStatusLabel(load.status)}
          variant={getLoadStatusVariant(load.status)}
        />
      </View>
    </Pressable>
  )
}
