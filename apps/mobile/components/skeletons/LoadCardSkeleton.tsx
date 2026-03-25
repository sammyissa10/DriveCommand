import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the LoadCard shape:
 * - Row: wide skeleton (load number) + small skeleton (badge)
 * - Row: medium skeleton (route)
 * - Row: small skeleton (customer) + small skeleton (date)
 */
export function LoadCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        gap: 10,
      }}
    >
      {/* Row 1: load number + badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton width={100} height={16} />
        <Skeleton width={64} height={20} borderRadius={10} />
      </View>

      {/* Row 2: customer */}
      <Skeleton width="70%" height={14} />

      {/* Row 3: route origin → destination */}
      <Skeleton width="90%" height={12} />

      {/* Row 4: driver label */}
      <Skeleton width="50%" height={12} />
    </View>
  )
}
