import React from 'react'
import Animated, { FadeIn } from 'react-native-reanimated'

interface AnimatedScreenProps {
  children: React.ReactNode
  style?: object
}

/**
 * Wraps screen content in a FadeIn animation (200ms) for smooth tab/stack transitions.
 * Do NOT use on: login screen (immediate auth) or bottom sheets (own animation).
 */
export function AnimatedScreen({ children, style }: AnimatedScreenProps) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[{ flex: 1 }, style]}>
      {children}
    </Animated.View>
  )
}
