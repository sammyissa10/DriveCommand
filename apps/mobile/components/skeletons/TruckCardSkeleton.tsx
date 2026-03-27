import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the TruckCard shape:
 * - Left: icon square (42x42)
 * - Center: truck name + license plate lines
 * - Right: status chip
 */
export function TruckCardSkeleton() {
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
      <Skeleton width={42} height={42} borderRadius={10} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="35%" height={12} />
      </View>
      <Skeleton width={76} height={22} borderRadius={11} />
    </View>
  )
}
