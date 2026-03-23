import React from 'react'
import { Text, View } from 'react-native'
import type { RouteStop } from '@drivecommand/api-client'

interface StopTimelineItemProps {
  stop: RouteStop
  isLast: boolean
}

function getStopDotColor(status: RouteStop['status']): string {
  switch (status) {
    case 'ARRIVED':
      return '#3b82f6' // blue-500
    case 'DEPARTED':
      return '#22c55e' // green-500
    case 'PENDING':
    default:
      return '#94a3b8' // slate-400
  }
}

function getStopStatusLabel(status: RouteStop['status']): string {
  switch (status) {
    case 'ARRIVED':
      return 'Arrived'
    case 'DEPARTED':
      return 'Departed'
    case 'PENDING':
    default:
      return 'Pending'
  }
}

function formatTime(isoString: string | null): string | null {
  if (!isoString) return null
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return null
  }
}

export function StopTimelineItem({ stop, isLast }: StopTimelineItemProps) {
  const dotColor = getStopDotColor(stop.status)
  const isActive = stop.status === 'ARRIVED'

  return (
    <View className="flex-row">
      {/* Left: dot + connecting line */}
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
        {/* Connecting line (not for last item) */}
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

      {/* Right: stop details */}
      <View
        className={`flex-1 pb-5 pl-3 ${isActive ? 'bg-sky-950/40 rounded-lg pr-2 -ml-1 pl-4' : ''}`}
      >
        {/* Stop type label */}
        <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
          {stop.type === 'PICKUP' ? 'Pickup' : 'Delivery'} · Stop {stop.position}
        </Text>

        {/* Address */}
        <Text className="text-sm font-semibold text-white mb-1">{stop.address}</Text>

        {/* Status row */}
        <View className="flex-row items-center gap-2">
          <Text
            className="text-xs font-medium"
            style={{ color: dotColor }}
          >
            {getStopStatusLabel(stop.status)}
          </Text>

          {/* Scheduled time */}
          {stop.scheduledAt && (
            <Text className="text-xs text-slate-500">
              Scheduled: {formatTime(stop.scheduledAt)}
            </Text>
          )}
        </View>

        {/* Actual arrival/departure times */}
        {stop.arrivedAt && (
          <Text className="text-xs text-slate-500 mt-0.5">
            Arrived: {formatTime(stop.arrivedAt)}
          </Text>
        )}
        {stop.departedAt && (
          <Text className="text-xs text-slate-500 mt-0.5">
            Departed: {formatTime(stop.departedAt)}
          </Text>
        )}
      </View>
    </View>
  )
}
