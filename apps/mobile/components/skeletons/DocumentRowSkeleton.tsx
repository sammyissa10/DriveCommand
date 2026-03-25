import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the DocumentRow shape:
 * - Left: icon box
 * - Center: file name + doc type + expiry
 * - Right: status badge
 */
export function DocumentRowSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        gap: 12,
      }}
    >
      {/* Icon box */}
      <Skeleton width={40} height={40} borderRadius={8} />

      {/* Text content */}
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width="70%" height={13} />
        <Skeleton width="50%" height={11} />
        <Skeleton width="60%" height={11} />
      </View>

      {/* Status badge */}
      <Skeleton width={52} height={20} borderRadius={10} />
    </View>
  )
}
