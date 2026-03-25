import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the DriverCard shape:
 * - Left: avatar circle
 * - Center: name + HOS status dot + load label
 * - Right: compliance dot
 */
export function DriverCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Avatar */}
      <Skeleton width={44} height={44} borderRadius={22} />

      {/* Center content */}
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="65%" height={15} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="55%" height={12} />
      </View>

      {/* Compliance dot */}
      <Skeleton width={12} height={12} borderRadius={6} />
    </View>
  )
}
