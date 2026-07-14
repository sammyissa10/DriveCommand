import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'

export type StatusTone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral' | 'vip'

/**
 * Literal class fragments per tone. Kept as literal strings so the NativeWind
 * compiler can see every class it must generate.
 */
const TONE: Record<StatusTone, { fill: string; dot: string; text: string }> = {
  success: { fill: 'bg-ds-success/14', dot: 'bg-ds-success', text: 'text-ds-success' },
  accent: { fill: 'bg-ds-accent/14', dot: 'bg-ds-accent', text: 'text-ds-accent' },
  warning: { fill: 'bg-ds-warning/14', dot: 'bg-ds-warning', text: 'text-ds-warning' },
  danger: { fill: 'bg-ds-danger/14', dot: 'bg-ds-danger', text: 'text-ds-danger' },
  neutral: { fill: 'bg-ds-txt2/14', dot: 'bg-ds-txt2', text: 'text-ds-txt2' },
  vip: { fill: 'bg-ds-vip/15', dot: 'bg-ds-vip', text: 'text-ds-vip' },
}

export interface StatusPillProps {
  label: string
  tone: StatusTone
}

/** Translucent status pill: 14% tint, colored dot + label. Height 22, radius 8. */
export function StatusPill({ label, tone }: StatusPillProps) {
  const t = TONE[tone]
  return (
    <View className={`h-[22px] flex-row items-center gap-1.5 self-start rounded-lg px-2 ${t.fill}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      <Text className={`text-[11px] font-semibold ${t.text}`}>{label}</Text>
    </View>
  )
}
