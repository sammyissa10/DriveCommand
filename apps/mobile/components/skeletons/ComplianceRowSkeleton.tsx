import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the AlertRow shape:
 * - Left: indicator dot (10x10)
 * - Center: entity name + document type lines
 * - Right: status chip + days text
 */
export function ComplianceRowSkeleton() {
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
      <Skeleton width={10} height={10} borderRadius={5} style={{ marginRight: 14, flexShrink: 0 }} />
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width="60%" height={15} />
        <Skeleton width="40%" height={12} />
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 10, gap: 4 }}>
        <Skeleton width={68} height={20} borderRadius={10} />
        <Skeleton width={52} height={12} />
      </View>
    </View>
  )
}
