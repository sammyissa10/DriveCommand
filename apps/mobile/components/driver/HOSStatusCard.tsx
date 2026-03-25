import React from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { Moon, BedDouble, Truck, Briefcase } from 'lucide-react-native'
import type { HOSStatus } from '@drivecommand/api-client'

interface HOSStatusCardProps {
  status: HOSStatus
  label: string
  isActive: boolean
  onPress: () => void
}

interface StatusConfig {
  icon: React.ReactNode
  activeBorderColor: string
  iconColor: string
}

function getStatusConfig(status: HOSStatus, isActive: boolean): StatusConfig {
  const iconSize = 28

  switch (status) {
    case 'OFF_DUTY':
      return {
        icon: <Moon color="#94a3b8" size={iconSize} />,
        activeBorderColor: '#94a3b8',
        iconColor: '#94a3b8',
      }
    case 'SLEEPER_BERTH':
      return {
        icon: <BedDouble color="#a78bfa" size={iconSize} />,
        activeBorderColor: '#c084fc',
        iconColor: '#a78bfa',
      }
    case 'DRIVING':
      return {
        icon: <Truck color="#4ade80" size={iconSize} />,
        activeBorderColor: '#4ade80',
        iconColor: '#4ade80',
      }
    case 'ON_DUTY':
      return {
        icon: <Briefcase color="#38bdf8" size={iconSize} />,
        activeBorderColor: '#38bdf8',
        iconColor: '#38bdf8',
      }
  }
}

export function HOSStatusCard({ status, label, isActive, onPress }: HOSStatusCardProps) {
  const config = getStatusConfig(status, isActive)

  return (
    <Pressable
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(255,255,255,0.1)', borderless: false } : undefined}
      style={[
        {
          flex: 1,
          minHeight: 80,
          borderRadius: 12,
          padding: 16,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? '#0ea5e9' : '#475569',
          backgroundColor: isActive ? '#334155' : '#1e293b',
        },
      ]}
    >
      <View>{config.icon}</View>
      <Text
        style={{
          color: isActive ? '#ffffff' : '#94a3b8',
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
      {isActive && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#0ea5e9',
          }}
        />
      )}
    </Pressable>
  )
}
