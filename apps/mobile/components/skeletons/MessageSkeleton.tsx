import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

interface MessageSkeletonProps {
  /** Align right (driver) or left (incoming) */
  isDriver?: boolean
}

/**
 * Mimics a MessageBubble shape:
 * - Sender label
 * - Bubble with text
 * - Timestamp
 */
export function MessageSkeleton({ isDriver = false }: MessageSkeletonProps) {
  return (
    <View
      style={{
        marginBottom: 12,
        paddingHorizontal: 16,
        alignItems: isDriver ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Sender label */}
      <Skeleton width={40} height={10} style={{ marginBottom: 4 }} />

      {/* Bubble */}
      <View
        style={{
          maxWidth: '75%',
          gap: 4,
          backgroundColor: '#1e293b',
          borderRadius: 16,
          padding: 12,
        }}
      >
        <Skeleton width={180} height={12} />
        <Skeleton width={120} height={12} />
      </View>

      {/* Timestamp */}
      <Skeleton width={36} height={10} style={{ marginTop: 4 }} />
    </View>
  )
}
