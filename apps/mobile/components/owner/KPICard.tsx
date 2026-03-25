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

const cardStyle = {
  backgroundColor: '#1e293b',
  borderWidth: 1,
  borderColor: '#334155',
  borderRadius: 12,
  padding: 12,
}

export const KPICard = memo(function KPICard({ label, value, icon, trend, onPress }: KPICardProps) {
  const trendColor =
    trend?.direction === 'up' ? '#34d399' :
    trend?.direction === 'down' ? '#f87171' : '#94a3b8'

  const TrendIcon =
    trend?.direction === 'up' ? TrendingUp :
    trend?.direction === 'down' ? TrendingDown : Minus

  const inner = (
    <>
      <View style={{ position: 'absolute', top: 10, right: 10 }}>{icon}</View>
      <Text
        style={{ fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginTop: 2, marginBottom: 2 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: trend ? 4 : 0 }}>
        {label}
      </Text>
      {trend && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TrendIcon color={trendColor} size={12} />
          <Text style={{ fontSize: 11, color: trendColor }}>{trend.label}</Text>
        </View>
      )}
    </>
  )

  if (onPress) {
    return (
      <Pressable
        style={{ flex: 1, ...cardStyle }}
        android_ripple={{ color: 'rgba(255,255,255,0.05)', borderless: false }}
        onPress={onPress}
      >
        {inner}
      </Pressable>
    )
  }

  return <View style={{ flex: 1, ...cardStyle }}>{inner}</View>
})
