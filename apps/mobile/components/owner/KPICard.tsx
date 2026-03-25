import React, { memo } from 'react'
import { Text, View } from 'react-native'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native'

interface KPICardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string }
}

export const KPICard = memo(function KPICard({ label, value, icon, trend }: KPICardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? '#34d399'
      : trend?.direction === 'down'
        ? '#f87171'
        : '#94a3b8'

  const TrendIcon =
    trend?.direction === 'up'
      ? TrendingUp
      : trend?.direction === 'down'
        ? TrendingDown
        : Minus

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* Icon top-right */}
      <View style={{ position: 'absolute', top: 12, right: 12 }}>{icon}</View>

      {/* Value */}
      <Text
        style={{
          fontSize: 30,
          fontWeight: 'bold',
          color: '#ffffff',
          marginTop: 4,
          marginBottom: 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>

      {/* Label */}
      <Text style={{ fontSize: 12, color: '#94a3b8', marginBottom: trend ? 6 : 0 }}>
        {label}
      </Text>

      {/* Trend */}
      {trend && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TrendIcon color={trendColor} size={12} />
          <Text style={{ fontSize: 11, color: trendColor }}>{trend.label}</Text>
        </View>
      )}
    </View>
  )
})
