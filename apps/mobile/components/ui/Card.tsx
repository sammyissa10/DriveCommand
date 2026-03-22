import React from 'react'
import { Pressable, View } from 'react-native'

interface CardProps {
  children: React.ReactNode
  className?: string
  onPress?: () => void
}

export function Card({ children, className = '', onPress }: CardProps) {
  const baseClass = `bg-slate-800 border border-slate-700 rounded-xl p-4 ${className}`

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${baseClass} active:opacity-80`}>
        {children}
      </Pressable>
    )
  }

  return <View className={baseClass}>{children}</View>
}
