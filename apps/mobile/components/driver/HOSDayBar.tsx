import React, { useMemo } from 'react'
import { Text, View } from 'react-native'
import type { HOSStatus, HOSEntry } from '@drivecommand/api-client'

interface HOSDayBarProps {
  entries: HOSEntry[]
  currentStatus: HOSStatus
}

const STATUS_COLORS: Record<HOSStatus, string> = {
  OFF_DUTY: '#475569',
  SLEEPER_BERTH: '#7c3aed',
  DRIVING: '#16a34a',
  ON_DUTY: '#0284c7',
}

const HOUR_LABELS = ['12a', '6a', '12p', '6p', '12a']

export function HOSDayBar({ entries, currentStatus }: HOSDayBarProps) {
  const { segments, currentTimeRatio } = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const totalDayMs = 24 * 60 * 60 * 1000

    const segs = entries.map((entry) => {
      const start = new Date(entry.startTime).getTime()
      const end = entry.endTime ? new Date(entry.endTime).getTime() : now.getTime()
      const dayStart = startOfDay.getTime()

      const clampedStart = Math.max(start, dayStart)
      const clampedEnd = Math.min(end, dayStart + totalDayMs)
      const duration = Math.max(0, clampedEnd - clampedStart)
      const ratio = duration / totalDayMs

      return {
        id: entry.id,
        ratio,
        color: STATUS_COLORS[entry.status],
        offsetRatio: (clampedStart - dayStart) / totalDayMs,
      }
    })

    const currentRatio = (now.getTime() - startOfDay.getTime()) / totalDayMs

    return {
      segments: segs.filter((s) => s.ratio > 0),
      currentTimeRatio: Math.min(Math.max(currentRatio, 0), 1),
    }
  }, [entries])

  return (
    <View>
      {/* Bar container */}
      <View
        style={{
          height: 32,
          borderRadius: 8,
          backgroundColor: '#334155',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Render each segment using absolute positioning */}
        {segments.map((seg) => (
          <View
            key={seg.id}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${seg.offsetRatio * 100}%` as unknown as number,
              width: `${seg.ratio * 100}%` as unknown as number,
              backgroundColor: seg.color,
            }}
          />
        ))}

        {/* Current time marker */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${currentTimeRatio * 100}%` as unknown as number,
            width: 2,
            backgroundColor: '#ef4444',
            zIndex: 10,
          }}
        />
      </View>

      {/* Hour labels */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
        }}
      >
        {HOUR_LABELS.map((label, i) => (
          <Text
            key={i}
            style={{
              fontSize: 11,
              color: '#64748b',
            }}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}
