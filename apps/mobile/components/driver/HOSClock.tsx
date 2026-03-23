import React, { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'

interface HOSClockProps {
  label: string
  hoursRemaining: number
  isWarning?: boolean
}

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const hh = Math.floor(clamped / 3600)
  const mm = Math.floor((clamped % 3600) / 60)
  const ss = clamped % 60
  return [
    String(hh).padStart(2, '0'),
    String(mm).padStart(2, '0'),
    String(ss).padStart(2, '0'),
  ].join(':')
}

export function HOSClock({ label, hoursRemaining, isWarning }: HOSClockProps) {
  const [totalSeconds, setTotalSeconds] = useState(() =>
    Math.round(hoursRemaining * 3600)
  )

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset when hoursRemaining prop changes (e.g., query refetch)
  useEffect(() => {
    setTotalSeconds(Math.round(hoursRemaining * 3600))
  }, [hoursRemaining])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTotalSeconds((prev) => {
        if (prev <= 0) return 0
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const warning = isWarning ?? hoursRemaining < 2
  const timeColor = warning ? '#ef4444' : '#ffffff'

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: '#94a3b8',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: timeColor,
          fontVariant: ['tabular-nums'],
          letterSpacing: 1,
        }}
      >
        {formatTime(totalSeconds)}
      </Text>
    </View>
  )
}
