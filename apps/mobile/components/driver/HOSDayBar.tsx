import React, { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import type { HOSEntry, HOSStatus } from '@drivecommand/api-client'

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

export function HOSDayBar({ entries }: HOSDayBarProps) {
  const [barWidth, setBarWidth] = useState(0)

  const { barSegments, currentTimeX } = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const totalDayMs = 24 * 60 * 60 * 1000
    const dayStart = startOfDay.getTime()

    const rawSegments = entries
      .map((entry) => {
        const start = new Date(entry.startTime).getTime()
        const end = entry.endTime ? new Date(entry.endTime).getTime() : now.getTime()

        const clampedStart = Math.max(start, dayStart)
        const clampedEnd = Math.min(end, dayStart + totalDayMs)
        const duration = Math.max(0, clampedEnd - clampedStart)
        const flexRatio = duration / totalDayMs

        return {
          id: entry.id,
          flexRatio,
          offsetRatio: (clampedStart - dayStart) / totalDayMs,
          color: STATUS_COLORS[entry.status],
        }
      })
      .filter((s) => s.flexRatio > 0)
      .sort((a, b) => a.offsetRatio - b.offsetRatio)

    // Build unified flex segments including transparent gaps
    const result: Array<{ flex: number; color: string | null; key: string }> = []
    let cursor = 0

    rawSegments.forEach((seg, i) => {
      const gap = seg.offsetRatio - cursor
      if (gap > 0.001) {
        result.push({ flex: gap, color: null, key: `gap-${i}` })
      }
      result.push({ flex: seg.flexRatio, color: seg.color, key: seg.id })
      cursor = seg.offsetRatio + seg.flexRatio
    })

    const trailing = 1 - cursor
    if (trailing > 0.001) {
      result.push({ flex: trailing, color: null, key: 'trailing' })
    }

    if (result.length === 0) {
      result.push({ flex: 1, color: null, key: 'empty' })
    }

    const currentTimeRatio = Math.min(
      Math.max((now.getTime() - dayStart) / totalDayMs, 0),
      1
    )
    const xPos = barWidth > 0 ? currentTimeRatio * barWidth : -4

    return { barSegments: result, currentTimeX: xPos }
  }, [entries, barWidth])

  return (
    <View>
      {/* Bar */}
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={{
          height: 32,
          borderRadius: 8,
          backgroundColor: '#334155',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {barSegments.map((s) => (
          <View
            key={s.key}
            style={{
              flex: s.flex,
              backgroundColor: s.color ?? 'transparent',
            }}
          />
        ))}

        {/* Current time marker — only render once we have bar width */}
        {barWidth > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: currentTimeX - 1,
              width: 2,
              backgroundColor: '#ef4444',
              zIndex: 10,
            }}
          />
        )}
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
          <Text key={i} style={{ fontSize: 11, color: '#64748b' }}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}
