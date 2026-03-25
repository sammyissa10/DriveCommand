import React from 'react'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
}

const variantStyles: Record<string, string> = {
  primary: 'bg-sky-500 border border-sky-500',
  secondary: 'bg-slate-700 border border-slate-600',
  destructive: 'bg-red-600 border border-red-600',
  ghost: 'bg-transparent border border-slate-600',
}

const variantTextStyles: Record<string, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  destructive: 'text-white',
  ghost: 'text-slate-300',
}

const sizeStyles: Record<string, string> = {
  sm: 'h-10 px-3',
  md: 'h-12 px-4',
  lg: 'h-14 px-6',
}

const sizeTextStyles: Record<string, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
}

/** Ripple color per variant — subtle light ripple on dark buttons */
const variantRipple: Record<string, string> = {
  primary: 'rgba(255,255,255,0.2)',
  secondary: 'rgba(255,255,255,0.1)',
  destructive: 'rgba(255,255,255,0.15)',
  ghost: 'rgba(255,255,255,0.08)',
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || isLoading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      android_ripple={
        Platform.OS === 'android'
          ? { color: variantRipple[variant], borderless: false }
          : undefined
      }
      className={`flex-row items-center justify-center rounded-xl overflow-hidden ${variantStyles[variant]} ${sizeStyles[size]} ${isDisabled ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {isLoading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <>
          {icon && <View className="mr-2">{icon}</View>}
          <Text
            className={`font-semibold ${variantTextStyles[variant]} ${sizeTextStyles[size]}`}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  )
}
