import React from 'react'
import { Text, View } from 'react-native'

interface BadgeProps {
  label: string
  variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'
}

const variantStyles: Record<string, { container: string; text: string }> = {
  success: { container: 'bg-emerald-900/60 border border-emerald-700', text: 'text-emerald-400' },
  warning: { container: 'bg-amber-900/60 border border-amber-700', text: 'text-amber-400' },
  danger: { container: 'bg-red-900/60 border border-red-700', text: 'text-red-400' },
  info: { container: 'bg-sky-900/60 border border-sky-700', text: 'text-sky-400' },
  muted: { container: 'bg-slate-700 border border-slate-600', text: 'text-slate-400' },
}

export function Badge({ label, variant }: BadgeProps) {
  const styles = variantStyles[variant]

  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${styles.container}`}>
      <Text className={`text-xs font-medium ${styles.text}`}>{label}</Text>
    </View>
  )
}
