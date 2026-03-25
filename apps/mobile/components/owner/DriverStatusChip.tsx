import React, { memo } from 'react'
import { Text, View } from 'react-native'

type HOSStatus = 'DRIVING' | 'ON_DUTY' | 'OFF_DUTY' | 'SLEEPER_BERTH'

interface DriverStatusChipProps {
  name: string
  hosStatus: HOSStatus | string | null
  activeLoadNumber: string | null
}

function getDotColor(status: HOSStatus | string | null): string {
  switch (status) {
    case 'DRIVING':
      return '#22c55e' // green
    case 'ON_DUTY':
      return '#38bdf8' // blue
    case 'OFF_DUTY':
    case 'SLEEPER_BERTH':
    default:
      return '#475569' // grey
  }
}

function getStatusLabel(status: HOSStatus | string | null): string {
  switch (status) {
    case 'DRIVING':
      return 'Driving'
    case 'ON_DUTY':
      return 'On Duty'
    case 'OFF_DUTY':
      return 'Off Duty'
    case 'SLEEPER_BERTH':
      return 'Sleeper'
    default:
      return 'Unknown'
  }
}

export const DriverStatusChip = memo(function DriverStatusChip({ name, hosStatus, activeLoadNumber }: DriverStatusChipProps) {
  const dotColor = getDotColor(hosStatus)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minHeight: 70,
        gap: 8,
      }}
    >
      {/* Status dot */}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Name + Load number */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 13, fontWeight: '600', color: '#e2e8f0' }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}
          numberOfLines={1}
        >
          {activeLoadNumber ? `#${activeLoadNumber}` : getStatusLabel(hosStatus)}
        </Text>
      </View>
    </View>
  )
})
