import React, { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native'

interface KPICardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  valueColor?: string
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string }
  onPress?: () => void
  accessibilityLabel?: string
  accentColor?: string
}

const cardStyle = {
  backgroundColor: '#162032',
  borderRadius: 12,
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 4,
}

const innerStyle = {
  paddingVertical: 12,
  paddingLeft: 16,
  paddingRight: 12,
  flex: 1,
}

export const KPICard = memo(function KPICard({ label, value, icon, valueColor = '#ffffff', trend, onPress, accessibilityLabel, accentColor }: KPICardProps) {
  const trendColor =
    trend?.direction === 'up' ? '#34d399' :
    trend?.direction === 'down' ? '#f87171' : '#94a3b8'

  const TrendIcon =
    trend?.direction === 'up' ? TrendingUp :
    trend?.direction === 'down' ? TrendingDown : Minus

  const accentStrip = accentColor ? (
    <View style={{
      position: 'absolute',
      left: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderRadius: 2,
      backgroundColor: accentColor,
    }} />
  ) : null

  const inner = (
    <>
      <View style={{ position: 'absolute', top: 10, right: 10 }}>{icon}</View>
      <Text
        style={{ fontSize: 26, fontWeight: 'bold', color: valueColor, marginTop: 2, marginBottom: 2 }}
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
      <View style={{ flex: 1, ...cardStyle, overflow: 'hidden' }}>
        {accentStrip}
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          style={innerStyle}
          android_ripple={{ color: 'rgba(255,255,255,0.05)', borderless: false }}
          onPress={onPress}
        >
          {inner}
        </Pressable>
      </View>
    )
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
      style={{ flex: 1, ...cardStyle, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 }}
    >
      {accentStrip}
      {inner}
    </View>
  )
})
