import React from 'react'
import { View, Text as RNText } from 'react-native'

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface MonogramAvatarProps {
  /** Full name — initials are derived. Ignored if `initials` is given. */
  name?: string
  initials?: string
  /** Diameter. 44 in list rows, 72 on detail. */
  size?: number
  /** Compliance flag — renders a small warning dot at the top-right. */
  warning?: boolean
}

/**
 * Circular monogram avatar for human entities (drivers, contacts). `ds.avatar`
 * fill, two initials in 600 weight. No photos until the user uploads one.
 */
export function MonogramAvatar({ name = '', initials, size = 44, warning = false }: MonogramAvatarProps) {
  const text = initials ?? initialsFrom(name)
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <View
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="items-center justify-center bg-ds-avatar"
      >
        <RNText style={{ fontSize: Math.round(size * 0.36) }} className="font-semibold text-ds-initials">
          {text}
        </RNText>
      </View>
      {warning ? (
        <View className="absolute right-0 top-0 h-3.5 w-3.5 items-center justify-center rounded-full bg-ds-bg">
          <View className="h-2.5 w-2.5 rounded-full bg-ds-warning" />
        </View>
      ) : null}
    </View>
  )
}
