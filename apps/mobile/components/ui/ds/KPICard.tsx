import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'
import type { StatusTone } from './StatusPill'

const VALUE_TINT: Record<StatusTone, string> = {
  success: 'text-ds-success',
  accent: 'text-ds-accent',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
  neutral: 'text-ds-txt',
  vip: 'text-ds-vip',
}

export interface KPICardProps {
  value: string | number
  label: string
  /** Tints the value when it maps to a status (e.g. VIP amber). */
  tone?: StatusTone
  /** Highlight when this KPI's filter is active. */
  active?: boolean
  /** Tapping applies the KPI's filter to the list below. */
  onPress?: () => void
}

/** KPI card: value 22 Bold, label below. Height 74, radius 18. Tap = filter. */
export function KPICard({ value, label, tone, active = false, onPress }: KPICardProps) {
  const valueClass = tone ? VALUE_TINT[tone] : 'text-ds-txt'
  return (
    <Pressable
      onPress={onPress ?? (() => {})}
      disabled={!onPress}
      haptic={onPress ? 'light' : 'none'}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ selected: active }}
      className={`h-[74px] flex-1 justify-center rounded-[18px] px-4 ${
        active ? 'bg-ds-elevated' : 'bg-ds-card'
      }`}
    >
      <Text variant="kpi" className={valueClass} numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[12px] text-ds-txt2" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export interface KPIRowProps {
  children: React.ReactNode
}

/** Row of 2–3 KPICards with the standard 12px card gap. */
export function KPIRow({ children }: KPIRowProps) {
  return <View className="flex-row gap-3">{children}</View>
}
