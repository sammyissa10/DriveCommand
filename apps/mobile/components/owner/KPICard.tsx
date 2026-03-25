import React, { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native'

interface KPICardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string }
  onPress?: () => void
}

export const KPICard = memo(function KPICard({ label, value, icon, trend, onPress }: KPICardProps) {
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

  const content = (
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 12,
      }}
    >
      {/* Icon top-right */}
      <View style={{ position: 'absolute', top: 10, right: 10 }}>{icon}</View>

      {/* Value */}
      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: '#ffffff',
          marginTop: 2,
          marginBottom: 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>

      {/* Label */}
      <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: trend ? 4 : 0 }}>
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

  if (onPress) {
    return (
      <Pressable
        style={{ flex: 1 }}
        android_ripple={{ color: 'rgba(255,255,255,0.05)', borderless: false }}
        onPress={onPress}
      >
        {content}
      </Pressable>
    )
  }

  return <View style={{ flex: 1 }}>{content}</View>
})
