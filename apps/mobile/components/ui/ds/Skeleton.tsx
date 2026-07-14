import React, { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { SHIMMER_MS } from './tokens'

export interface SkeletonProps {
  width?: number | `${number}%`
  height?: number
  rounded?: number
}

/**
 * Content-shaped skeleton block in `ds.elevated` fill with an 800ms shimmer.
 * The colored surface lives on an inner View (NativeWind class) while the
 * Animated wrapper carries only opacity — never a spinner on data screens.
 */
export function Skeleton({ width = '100%', height = 16, rounded = 8 }: SkeletonProps) {
  const opacity = useSharedValue(0.4)

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.9, { duration: SHIMMER_MS }), -1, true)
  }, [])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View style={style}>
      <View style={{ width, height, borderRadius: rounded }} className="bg-ds-elevated" />
    </Animated.View>
  )
}

/** Skeleton shaped like an EntityRow card — for Overview loading states. */
export function EntityRowSkeleton() {
  return (
    <View className="min-h-[92px] flex-row items-center gap-3 rounded-[20px] bg-ds-card p-4">
      <Skeleton width={44} height={44} rounded={22} />
      <View className="flex-1 gap-2">
        <Skeleton width="55%" height={16} />
        <Skeleton width="40%" height={13} />
        <Skeleton width="30%" height={13} />
      </View>
    </View>
  )
}

/** N stacked EntityRow skeletons with the standard 12px gap. */
export function EntityListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <EntityRowSkeleton key={i} />
      ))}
    </View>
  )
}
