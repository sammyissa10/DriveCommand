import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the fuel entry row shape:
 * - Left: date + truck name
 * - Right: gallons/cost + location
 */
export function FuelRowSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginHorizontal: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width="35%" height={14} />
        <Skeleton width="55%" height={12} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Skeleton width={72} height={14} />
        <Skeleton width={52} height={12} />
      </View>
    </View>
  )
}
