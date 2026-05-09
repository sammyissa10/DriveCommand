import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the CustomerCard shape:
 * - Left: avatar square (42x42, borderRadius 10)
 * - Center: company name + two status/priority badge chips
 */
export function CRMCardSkeleton() {
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
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Skeleton width={42} height={42} borderRadius={10} style={{ marginRight: 14, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
        <Skeleton width="60%" height={15} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={56} height={20} borderRadius={10} />
          <Skeleton width={36} height={20} borderRadius={10} />
        </View>
      </View>
    </View>
  )
}
