import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the PayrollRow shape:
 * - Left: avatar circle (42x42)
 * - Center: driver name + period lines
 * - Right: amount + status chip
 */
export function PayrollRowSkeleton() {
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
      <Skeleton width={42} height={42} borderRadius={21} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="45%" height={12} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Skeleton width={64} height={16} />
        <Skeleton width={52} height={20} borderRadius={10} />
      </View>
    </View>
  )
}
