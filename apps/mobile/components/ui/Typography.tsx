import React from 'react'
import { StyleSheet, Text, TextProps } from 'react-native'
import { colors, typography } from '../../constants/tokens'

interface TypographyProps extends TextProps {
  children: React.ReactNode
  className?: string
}

export function H1({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.h1, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function H2({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.h2, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function H3({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.h3, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Heading({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.heading, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Body({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.body, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function BodySmall({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.bodySmall, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Muted({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.muted, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Caption({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.caption, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Footnote({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.footnote, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Callout({ children, className = '', style, ...props }: TypographyProps) {
  return (
    <Text
      style={[styles.callout, style]}
      className={className}
      {...props}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  h1: {
    ...typography.title1,
    fontFamily: 'Poppins-SemiBold',
    color: colors.textPrimary,
  },
  h2: {
    ...typography.title2,
    fontFamily: 'Poppins-SemiBold',
    color: colors.textPrimary,
  },
  h3: {
    ...typography.title3,
    fontFamily: 'Poppins-SemiBold',
    color: colors.textPrimary,
  },
  heading: {
    ...typography.headline,
    fontFamily: 'Poppins-SemiBold',
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
  },
  bodySmall: {
    ...typography.subhead,
    color: colors.textPrimary,
  },
  muted: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  caption: {
    ...typography.caption1,
    color: colors.textTertiary,
  },
  footnote: {
    ...typography.footnote,
    color: colors.textSecondary,
  },
  callout: {
    ...typography.callout,
    color: colors.textPrimary,
  },
})
