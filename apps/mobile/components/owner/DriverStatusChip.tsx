import React, { memo } from 'react'
import { Text, View } from 'react-native'

type HOSStatus = 'DRIVING' | 'ON_DUTY' | 'OFF_DUTY' | 'SLEEPER_BERTH'

interface DriverStatusChipProps {
  name: string
  hosStatus: HOSStatus | string | null
  activeLoadNumber: string | null
}

const AVATAR_COLORS = [
  '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
  '#ef4444', '#ec4899', '#06b6d4', '#f97316',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function getStatusColor(status: HOSStatus | string | null): string {
  switch (status) {
    case 'DRIVING': return '#22c55e'
    case 'ON_DUTY': return '#38bdf8'
    default: return '#475569'
  }
}

function getStatusLabel(status: HOSStatus | string | null): string {
  switch (status) {
    case 'DRIVING': return 'Driving'
    case 'ON_DUTY': return 'On Duty'
    case 'OFF_DUTY': return 'Off Duty'
    case 'SLEEPER_BERTH': return 'Sleeper'
    default: return 'Off Duty'
  }
}

export const DriverStatusChip = memo(function DriverStatusChip({
  name,
  hosStatus,
  activeLoadNumber,
}: DriverStatusChipProps) {
  const avatarColor = getAvatarColor(name)
  const initials = getInitials(name)
  const statusColor = getStatusColor(hosStatus)
  const statusLabel = getStatusLabel(hosStatus)

  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 10,
        padding: 10,
        gap: 8,
        alignItems: 'center',
      }}
    >
      {/* Avatar with status dot */}
      <View style={{ position: 'relative' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: avatarColor + '33',
            borderWidth: 2,
            borderColor: avatarColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: avatarColor, fontWeight: '700', fontSize: 13 }}>
            {initials}
          </Text>
        </View>
        {/* Status dot — bottom-right of avatar */}
        <View
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: statusColor,
            borderWidth: 1.5,
            borderColor: '#1e293b',
          }}
        />
      </View>

      {/* Name */}
      <Text
        style={{ fontSize: 11, fontWeight: '600', color: '#e2e8f0', textAlign: 'center' }}
        numberOfLines={1}
      >
        {name.split(' ')[0]}
      </Text>

      {/* Load or status */}
      <Text
        style={{ fontSize: 10, color: activeLoadNumber ? '#38bdf8' : statusColor, textAlign: 'center', marginTop: -6 }}
        numberOfLines={1}
      >
        {activeLoadNumber ? `#${activeLoadNumber}` : statusLabel}
      </Text>
    </View>
  )
})
