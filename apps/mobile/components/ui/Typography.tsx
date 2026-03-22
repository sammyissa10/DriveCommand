import React from 'react'
import { Text, TextProps } from 'react-native'

interface TypographyProps extends TextProps {
  children: React.ReactNode
  className?: string
}

export function Heading({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text
      style={{ fontFamily: 'Poppins-SemiBold' }}
      className={`text-white ${className}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function H1({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text
      style={{ fontFamily: 'Poppins-SemiBold' }}
      className={`text-white text-3xl ${className}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function H2({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text
      style={{ fontFamily: 'Poppins-SemiBold' }}
      className={`text-white text-2xl ${className}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function H3({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text
      style={{ fontFamily: 'Poppins-SemiBold' }}
      className={`text-white text-xl ${className}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Body({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text className={`text-white text-base ${className}`} {...props}>
      {children}
    </Text>
  )
}

export function BodySmall({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text className={`text-white text-sm ${className}`} {...props}>
      {children}
    </Text>
  )
}

export function Muted({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text className={`text-slate-400 text-base ${className}`} {...props}>
      {children}
    </Text>
  )
}

export function Caption({ children, className = '', ...props }: TypographyProps) {
  return (
    <Text className={`text-slate-500 text-xs ${className}`} {...props}>
      {children}
    </Text>
  )
}
